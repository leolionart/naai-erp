import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";
import { authHeaders, seedPeriodCloseTestOrg } from "./period-close-test-fixture.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && Boolean(process.env.DATABASE_URL);
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration(
  "T-INT-CLOSE-001 monthly close checklist, negative custody alert and cash count",
  () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const org = `org-987-${randomUUID()}`;
    const ownerToken = `tok-987-${org}`;
    let app: Awaited<ReturnType<typeof createApp>>;

    beforeAll(async () => {
      await seedPeriodCloseTestOrg(pool, org, ownerToken);
      app = await createApp();
      await app.init();

      for (const [id, body] of [
        [
          "fa-bank",
          {
            code: "BANK-MAIN",
            kind: "bank",
            bankCode: "VCB",
            displayName: "VCB Cong ty",
            ledgerAccountCode: "112-BANK",
          },
        ],
        ["fa-cash-company", { code: "CASH-COMPANY", kind: "cash", displayName: "Ket cong ty" }],
        [
          "fa-cash-custody",
          { code: "CASH-OWNER-CUSTODY", kind: "cash", displayName: "Quy tien mat do chu giu" },
        ],
      ] as const) {
        const res = await app.inject({
          method: "POST",
          url: `/api/v1/organizations/${org}/banking/accounts`,
          headers: authHeaders(ownerToken, `fa-${id}`),
          payload: { id, currency: "VND", ...body },
        });
        expect(res.statusCode, res.body).toBe(201);
      }

      await pool.query(
        `insert into journal_entries(organization_id,id,journal_date,description,currency,state,version,created_by,approved_at,approved_by,approval_reason,posted_at,posted_by)
         values ($1,'j-seed-987','2026-08-01','Von va LN giu lai','VND','posted',2,'owner-1',now(),'owner-1','seed',now(),'owner-1')`,
        [org],
      );
      await pool.query(
        `insert into journal_lines(organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions) values
           ($1,'j-seed-987',1,'112-BANK',50000000,null,'Bank opening','{}'),
           ($1,'j-seed-987',2,'411-CAPITAL',null,40000000,'Capital','{}'),
           ($1,'j-seed-987',3,'421-RE',null,10000000,'Retained earnings','{}')`,
        [org],
      );
    });

    afterAll(async () => {
      await app?.close();
      await pool.end();
    });

    it("surfaces negative custody alert on dashboard and checklist, warns without blocking close, and clears warnings once handled or noted", async () => {
      await pool.query(
        `insert into bank_transactions(organization_id,id,financial_account_id,fingerprint,booking_date,amount_minor,currency,description,state) values
           ($1,'tx-987-out','fa-bank',repeat('a',64),'2026-08-02',-2000000,'VND','Giao quy chu giu','imported'),
           ($1,'tx-987-in','fa-cash-custody',repeat('b',64),'2026-08-02',2000000,'VND','Nhan quy chu giu','imported'),
           ($1,'tx-987-unrec','fa-bank',repeat('c',64),'2026-08-10',-500000,'VND','Phi NH chua doi soat','imported')`,
        [org],
      );
      const transfer = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${org}/banking/internal-transfers`,
        headers: authHeaders(ownerToken, "it-987"),
        payload: {
          schemaVersion: 1,
          id: "it-987-1",
          postingMode: "direct",
          sourceTransactionId: "tx-987-out",
          destinationTransactionId: "tx-987-in",
          currency: "VND",
          principalAmountMinor: "2000000",
          basePrincipalAmountMinor: "2000000",
          transitAccountId: "113-TRANSIT",
          reason: "Giao quy chu giu dau thang",
        },
      });
      expect(transfer.statusCode, transfer.body).toBe(201);

      const expExcess = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${org}/expenses`,
        headers: authHeaders(ownerToken, "exp-excess-987"),
        payload: {
          id: "exp-excess-987",
          expenseClass: "receipt_backed",
          payeePartyId: "SUP-1",
          expenseDate: "2026-08-05",
          businessPurpose: "Chi tiep khach vuot quy chu giu",
          currency: "VND",
          netMinor: "3500000",
          vatMinor: "0",
          grossMinor: "3500000",
          counterAccountCode: "",
          paymentMethod: "cash",
          paidOn: "2026-08-05",
          funding: { type: "owner_custody_cash", financialAccountId: "fa-cash-custody" },
          lines: [
            {
              description: "Tiep khach",
              netMinor: "3500000",
              vatMinor: "0",
              grossMinor: "3500000",
              postingAccountCode: "642-OPEX",
              expenseCategoryCode: "OFFICE",
              allocations: [
                { id: "a-ex-1", amountMinor: "3500000", dimensions: { costCenter: "ADMIN" } },
              ],
            },
          ],
        },
      });
      expect(expExcess.statusCode, expExcess.body).toBe(201);

      const expGap = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${org}/expenses`,
        headers: authHeaders(ownerToken, "exp-gap-987"),
        payload: {
          id: "exp-gap-987",
          expenseClass: "invoice_backed",
          payeePartyId: "SUP-1",
          expenseDate: "2026-08-12",
          businessPurpose: "Mua thiet bi 6tr tien mat chua co chung tu CK",
          currency: "VND",
          netMinor: "5500000",
          vatMinor: "500000",
          grossMinor: "6000000",
          counterAccountCode: "3388-OWNER",
          paymentMethod: "cash",
          paidOn: "2026-08-12",
          externalReference: { system: "paperless", externalId: "doc-gap-987" },
          lines: [
            {
              description: "Thiet bi van phong",
              netMinor: "5500000",
              vatMinor: "500000",
              grossMinor: "6000000",
              postingAccountCode: "642-OPEX",
              vatAccountCode: "1331-VAT",
              expenseCategoryCode: "OFFICE",
              allocations: [
                { id: "a-gap-1", amountMinor: "5500000", dimensions: { costCenter: "ADMIN" } },
              ],
            },
          ],
        },
      });
      expect(expGap.statusCode, expGap.body).toBe(201);

      const dashboard = await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${org}/reports/operating-dashboard?startsOn=2026-08-01&endsOn=2026-08-31&asOf=2026-08-31`,
        headers: authHeaders(ownerToken),
      });
      expect(dashboard.statusCode, dashboard.body).toBe(200);
      const financials = dashboard.json().data.financials;
      expect(financials.ownerCashCustodyMinor).toBe("-1500000");
      expect(financials.configurationWarnings).toContain("owner_custody_negative");
      expect(financials.negativeOwnerCustodyAlert).toMatchObject({
        isNegative: true,
        custodyAccountCode: "111-OWNER-CUSTODY",
        balanceMinor: "-1500000",
        deficitMinor: "1500000",
        suggestedTargetFunding: "owner_paid",
      });

      const checklist1 = await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${org}/fiscal-periods/2026/8/close-checklist`,
        headers: authHeaders(ownerToken),
      });
      expect(checklist1.statusCode, checklist1.body).toBe(200);
      const cl1 = checklist1.json().data;
      expect(cl1.readyWithoutWarnings).toBe(false);
      expect(cl1.warnings).toEqual(
        expect.arrayContaining([
          "unlinked_funding",
          "payment_evidence_gaps",
          "bank_reconciled",
          "owner_custody_non_negative",
        ]),
      );
      expect(cl1.items.find((i: { code: string }) => i.code === "ap_tied")?.status).toBe("passed");
      expect(cl1.negativeCustodyAlert.suggestedTargetFunding).toBe("owner_paid");

      const closeWithWarnings = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${org}/fiscal-periods/close`,
        headers: authHeaders(ownerToken, "close-2026-08-warn"),
        payload: {
          fiscalYear: 2026,
          periodNumber: 8,
          targetState: "soft_locked",
          reason: "Chu dong khoa mem cuoi thang, da nam cac canh bao",
        },
      });
      expect(closeWithWarnings.statusCode, closeWithWarnings.body).toBe(201);
      expect(closeWithWarnings.json().data).toMatchObject({
        state: "soft_locked",
        closedWithWarnings: true,
      });
      expect(closeWithWarnings.json().data.checklistWarnings).toContain(
        "owner_custody_non_negative",
      );

      const reopen = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${org}/fiscal-periods/reopen`,
        headers: authHeaders(ownerToken, "reopen-2026-08"),
        payload: {
          fiscalYear: 2026,
          periodNumber: 8,
          targetState: "open",
          reason: "Mo lai ky de xu ly quy chu giu am va doi soat ngan hang",
        },
      });
      expect(reopen.statusCode, reopen.body).toBe(201);

      const expExcessDetail = await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${org}/expenses/exp-excess-987`,
        headers: authHeaders(ownerToken),
      });
      const reclassExcess = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${org}/expenses/exp-excess-987/reclassify-funding`,
        headers: {
          ...authHeaders(ownerToken, "reclass-excess-987"),
          "if-match": String(expExcessDetail.json().data.version),
        },
        payload: {
          counterAccountCode: "3388-OWNER",
          postReplacement: true,
          reason: "Chuyen khoan vuot quy chu giu sang chu chi ho (owner_paid)",
        },
      });
      expect(reclassExcess.statusCode, reclassExcess.body).toBe(201);

      const unlinkedBefore = await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${org}/funding-plans/unlinked`,
        headers: authHeaders(ownerToken),
      });
      for (const item of unlinkedBefore.json().data.items as Array<{ id: string }>) {
        const detail = await app.inject({
          method: "GET",
          url: `/api/v1/organizations/${org}/expenses/${item.id}`,
          headers: authHeaders(ownerToken),
        });
        const targetFa = item.id === "exp-gap-987" ? "fa-cash-company" : "fa-bank";
        const res = await app.inject({
          method: "POST",
          url: `/api/v1/organizations/${org}/expenses/${item.id}/reclassify-funding`,
          headers: {
            ...authHeaders(ownerToken, `link-${item.id}`),
            "if-match": String(detail.json().data.version),
          },
          payload: {
            financialAccountId: targetFa,
            postReplacement: true,
            reason: "Gan tai khoan nguon tien hop le",
          },
        });
        expect(res.statusCode, res.body).toBe(201);
      }

      const notePayload = {
        itemCode: "payment_evidence_gaps",
        note: "Khoan mua 6tr tien mat da chap nhan giu lai khau tru cho den khi co phu luc thanh toan",
        reason: "Chu doanh nghiep xac nhan khi dong ky thang 8",
      };
      const noteRes = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${org}/fiscal-periods/2026/8/close-checklist/notes`,
        headers: authHeaders(ownerToken, "note-gap-987"),
        payload: notePayload,
      });
      expect(noteRes.statusCode, noteRes.body).toBe(201);
      expect(noteRes.json().data.idempotencyReplayed).toBe(false);

      const noteReplay = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${org}/fiscal-periods/2026/8/close-checklist/notes`,
        headers: authHeaders(ownerToken, "note-gap-987"),
        payload: notePayload,
      });
      expect(noteReplay.statusCode, noteReplay.body).toBe(201);
      expect(noteReplay.json().data.idempotencyReplayed).toBe(true);

      const ignoreTx = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${org}/banking/transactions/tx-987-unrec/ignore`,
        headers: authHeaders(ownerToken, "ignore-tx-987"),
        payload: { reason: "Giao dich nhap trung tren sao ke thu nghiem" },
      });
      expect(ignoreTx.statusCode, ignoreTx.body).toBe(201);

      const checklist2 = await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${org}/fiscal-periods/2026/8/close-checklist`,
        headers: authHeaders(ownerToken),
      });
      expect(checklist2.statusCode, checklist2.body).toBe(200);
      const cl2 = checklist2.json().data;
      expect(cl2.readyWithoutWarnings, JSON.stringify(cl2.items)).toBe(true);
      expect(cl2.warningCount).toBe(0);
      expect(cl2.negativeCustodyAlert).toBeNull();
      expect(
        cl2.items.find((i: { code: string }) => i.code === "payment_evidence_gaps")?.status,
      ).toBe("noted");
    });

    it("records cash counts (kiểm quỹ) with shortage, overage, exact match, idempotency, and audit trail", async () => {
      const listBefore = await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${org}/banking/cash-counts?asOf=2026-08-31`,
        headers: authHeaders(ownerToken),
      });
      expect(listBefore.statusCode, listBefore.body).toBe(200);
      expect(listBefore.json().data.currentBookBalanceMinor).toBe("2000000");

      const badNegative = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${org}/banking/cash-counts`,
        headers: authHeaders(ownerToken, "cc-neg"),
        payload: {
          countedOn: "2026-08-31",
          countedBalanceMinor: "-100",
          reason: "Invalid negative cash",
        },
      });
      expect(badNegative.statusCode).toBe(422);
      expect(badNegative.json().error.code).toBe("CASH_COUNT_NEGATIVE_PHYSICAL_BALANCE");

      const shortageReq = {
        id: "cc-short-1",
        countedOn: "2026-08-31",
        countedBalanceMinor: "1850000",
        reason: "Thieu tien le khi kiem quy cuoi thang 8",
        note: "Da kiem dem 2 lan",
      };
      const shortage = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${org}/banking/cash-counts`,
        headers: authHeaders(ownerToken, "cc-short-key"),
        payload: shortageReq,
      });
      expect(shortage.statusCode, shortage.body).toBe(201);
      const sData = shortage.json().data;
      expect(sData).toMatchObject({
        id: "cc-short-1",
        bookBalanceMinor: "2000000",
        countedBalanceMinor: "1850000",
        differenceMinor: "-150000",
        afterCustodyBalanceMinor: "1850000",
        status: "shortage",
        adjustmentAccountCode: "811-CASH-SHORT",
        idempotencyReplayed: false,
      });

      const shortLines = await pool.query<{ account_code: string; debit: string; credit: string }>(
        `select account_code, coalesce(debit_minor,0)::text as debit, coalesce(credit_minor,0)::text as credit
           from journal_lines where organization_id=$1 and journal_id=$2 order by line_number`,
        [org, sData.journalId],
      );
      expect(shortLines.rows).toEqual([
        { account_code: "811-CASH-SHORT", debit: "150000", credit: "0" },
        { account_code: "111-OWNER-CUSTODY", debit: "0", credit: "150000" },
      ]);

      const shortageReplay = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${org}/banking/cash-counts`,
        headers: authHeaders(ownerToken, "cc-short-key"),
        payload: shortageReq,
      });
      expect(shortageReplay.statusCode).toBe(201);
      expect(shortageReplay.json().data.idempotencyReplayed).toBe(true);
      expect(shortageReplay.json().data.journalId).toBe(sData.journalId);

      const overage = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${org}/banking/cash-counts`,
        headers: authHeaders(ownerToken, "cc-over-key"),
        payload: {
          id: "cc-over-1",
          countedOn: "2026-08-31",
          countedBalanceMinor: "1920000",
          reason: "Tim thay khoan tien le chua dem dot truoc",
        },
      });
      expect(overage.statusCode, overage.body).toBe(201);
      expect(overage.json().data).toMatchObject({
        bookBalanceMinor: "1850000",
        countedBalanceMinor: "1920000",
        differenceMinor: "70000",
        status: "overage",
        adjustmentAccountCode: "711-CASH-OVER",
      });

      const matched = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${org}/banking/cash-counts`,
        headers: authHeaders(ownerToken, "cc-match-key"),
        payload: {
          id: "cc-match-1",
          countedOn: "2026-08-31",
          countedBalanceMinor: "1920000",
          reason: "Xac nhan khop so du quy cuoi thang",
        },
      });
      expect(matched.statusCode, matched.body).toBe(201);
      expect(matched.json().data).toMatchObject({
        bookBalanceMinor: "1920000",
        countedBalanceMinor: "1920000",
        differenceMinor: "0",
        status: "matched",
        journalId: null,
        adjustmentAccountCode: null,
      });
    });
  },
);
