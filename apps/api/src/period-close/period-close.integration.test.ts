import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";
import { authHeaders, seedPeriodCloseTestOrg } from "./period-close-test-fixture.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && Boolean(process.env.DATABASE_URL);
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration(
  "T-INT-CLOSE-001 monthly close checklist, cash count, negative custody alert and year-end owner settlement",
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
      // Transfer 2,000,000 into 111-OWNER-CUSTODY, then spend 3,500,000 -> custody balance = -1,500,000
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

      // Spend 3,500,000 from owner custody -> 111-OWNER-CUSTODY = -1,500,000
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

      // Create an unlinked 6,000,000 VND cash expense (>= 5,000,000 threshold -> payment_evidence_missing AND unlinked funding!)
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

      // Verify Dashboard surfaces negative custody alert suggesting owner_paid
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

      // Check monthly close checklist for 2026-08
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

      // Closing period ONLY WARNS: owner can close with reason
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

      // Reopen period 2026-08 to remediate all warnings
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

      // 1) Reclassify excess 3,500,000 custody expense to owner_paid -> 111-OWNER-CUSTODY = +2,000,000
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

      // Note: both replacement and exp-gap-987 are owner_paid without financialAccountId -> link exp-gap-987 & replacement to company_bank OR note!
      // Let's reclassify both unlinked expenses to fa-bank so unlinked_funding count = 0!
      const unlinkedBefore = await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${org}/funding-plans/unlinked`,
        headers: authHeaders(ownerToken),
      });
      for (const item of unlinkedBefore.json().data.items as Array<{ id: string }>) {
        if (item.id === "exp-gap-987") {
          const detail = await app.inject({
            method: "GET",
            url: `/api/v1/organizations/${org}/expenses/${item.id}`,
            headers: authHeaders(ownerToken),
          });
          const res = await app.inject({
            method: "POST",
            url: `/api/v1/organizations/${org}/expenses/${item.id}/reclassify-funding`,
            headers: {
              ...authHeaders(ownerToken, `link-${item.id}`),
              "if-match": String(detail.json().data.version),
            },
            payload: {
              financialAccountId: "fa-cash-company",
              postReplacement: true,
              reason: "Gan tai khoan ket cong ty cho khoan chi tien mat 6tr",
            },
          });
          expect(res.statusCode, res.body).toBe(201);
        } else {
          // Keep exp-excess replacement as owner_paid? Wait: let's also have a dedicated owner_paid expense in Dec for year-end settlement, and link Aug item to fa-bank so Aug unlinked count = 0!
          const detail = await app.inject({
            method: "GET",
            url: `/api/v1/organizations/${org}/expenses/${item.id}`,
            headers: authHeaders(ownerToken),
          });
          const res = await app.inject({
            method: "POST",
            url: `/api/v1/organizations/${org}/expenses/${item.id}/reclassify-funding`,
            headers: {
              ...authHeaders(ownerToken, `link-${item.id}`),
              "if-match": String(detail.json().data.version),
            },
            payload: {
              financialAccountId: "fa-bank",
              postReplacement: true,
              reason: "Gan tai khoan ngan hang cho khoan tiep khach",
            },
          });
          expect(res.statusCode, res.body).toBe(201);
        }
      }

      // 2) Note payment_evidence_gaps on 2026-08 checklist (plus idempotent replay)
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

      // 3) Ignore / handle the imported bank tx so bank_reconciled passes
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
      // Current 111-OWNER-CUSTODY balance is 2,000,000 VND
      const listBefore = await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${org}/banking/cash-counts?asOf=2026-08-31`,
        headers: authHeaders(ownerToken),
      });
      expect(listBefore.statusCode, listBefore.body).toBe(200);
      expect(listBefore.json().data.currentBookBalanceMinor).toBe("2000000");

      // Negative physical count is rejected
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

      // 1) Shortage: counted 1,850,000 vs book 2,000,000 -> difference = -150,000 (Dr 811-CASH-SHORT / Cr 111-OWNER-CUSTODY)
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
      expect(sData.journalId).toBeTruthy();

      const shortLines = await pool.query<{
        account_code: string;
        debit: string;
        credit: string;
      }>(
        `select account_code, coalesce(debit_minor,0)::text as debit, coalesce(credit_minor,0)::text as credit
           from journal_lines where organization_id=$1 and journal_id=$2 order by line_number`,
        [org, sData.journalId],
      );
      expect(shortLines.rows).toEqual([
        { account_code: "811-CASH-SHORT", debit: "150000", credit: "0" },
        { account_code: "111-OWNER-CUSTODY", debit: "0", credit: "150000" },
      ]);

      // Idempotent replay
      const shortageReplay = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${org}/banking/cash-counts`,
        headers: authHeaders(ownerToken, "cc-short-key"),
        payload: shortageReq,
      });
      expect(shortageReplay.statusCode).toBe(201);
      expect(shortageReplay.json().data.idempotencyReplayed).toBe(true);
      expect(shortageReplay.json().data.journalId).toBe(sData.journalId);

      // 2) Overage: counted 1,920,000 vs book 1,850,000 -> difference = +70,000 (Dr 111-OWNER-CUSTODY / Cr 711-CASH-OVER)
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

      // 3) Exact match: counted 1,920,000 vs book 1,920,000 -> difference = 0, no journal
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

    it("reports year-end owner position (3388, 1388, 111-OWNER-CUSTODY) and settles via offset, profit distribution (Dr 421 / Cr 1388), and repayment", async () => {
      // Seed December owner-paid expense (Cr 3388-OWNER = 5,000,000) and owner-personal spend from bank (Dr 1388-OWNER / Cr 112-BANK = 4,000,000)
      const ownerPaidDec = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${org}/expenses`,
        headers: authHeaders(ownerToken, "exp-3388-dec"),
        payload: {
          id: "exp-3388-dec",
          expenseClass: "receipt_backed",
          payeePartyId: "SUP-1",
          expenseDate: "2026-12-05",
          businessPurpose: "Chu chi ho chi phi server thang 12",
          currency: "VND",
          netMinor: "5000000",
          vatMinor: "0",
          grossMinor: "5000000",
          counterAccountCode: "",
          paymentMethod: "card",
          paidOn: "2026-12-05",
          paymentEvidenceRef: "PERSONAL-CARD-DEC-01",
          funding: { type: "owner_paid" },
          lines: [
            {
              description: "Server cloud",
              netMinor: "5000000",
              vatMinor: "0",
              grossMinor: "5000000",
              postingAccountCode: "642-OPEX",
              expenseCategoryCode: "OFFICE",
              allocations: [
                { id: "a-dec-1", amountMinor: "5000000", dimensions: { costCenter: "ADMIN" } },
              ],
            },
          ],
        },
      });
      expect(ownerPaidDec.statusCode, ownerPaidDec.body).toBe(201);

      const ownerPersonalDec = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${org}/expenses`,
        headers: authHeaders(ownerToken, "exp-1388-dec"),
        payload: {
          id: "exp-1388-dec",
          expenseClass: "owner_personal",
          payeePartyId: "SUP-1",
          expenseDate: "2026-12-10",
          businessPurpose: "Chi ca nhan cua chu tu tai khoan cong ty",
          currency: "VND",
          netMinor: "4000000",
          vatMinor: "0",
          grossMinor: "4000000",
          counterAccountCode: "",
          funding: { type: "company_bank", financialAccountId: "fa-bank" },
          lines: [
            {
              description: "Chi tieu ca nhan",
              netMinor: "4000000",
              vatMinor: "0",
              grossMinor: "4000000",
              postingAccountCode: "1388-OWNER",
              allocations: [
                { id: "a-dec-2", amountMinor: "4000000", dimensions: { costCenter: "ADMIN" } },
              ],
            },
          ],
        },
      });
      expect(ownerPersonalDec.statusCode, ownerPersonalDec.body).toBe(201);

      // Position report before settlements: 3388 = 5,000,000, 1388 = 4,000,000, 111-OWNER-CUSTODY = 1,920,000, net = +1,000,000
      const pos0 = await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${org}/banking/owner-settlements/position?fiscalYear=2026&asOf=2026-12-31`,
        headers: authHeaders(ownerToken),
      });
      expect(pos0.statusCode, pos0.body).toBe(200);
      expect(pos0.json().data).toMatchObject({
        fiscalYear: 2026,
        payable3388Minor: "5000000",
        receivable1388Minor: "4000000",
        ownerCustody111Minor: "1920000",
        retainedEarnings421Minor: "10000000",
        netOwnerPositionMinor: "1000000",
      });

      // Reject using 111-OWNER-CUSTODY as repayment account
      const rejectCustody = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${org}/banking/owner-settlements`,
        headers: authHeaders(ownerToken, "settle-bad-custody"),
        payload: {
          fiscalYear: 2026,
          effectiveOn: "2026-12-31",
          option: "repayment",
          repaymentDirection: "company_to_owner",
          financialAccountId: "fa-cash-custody",
          amountMinor: "1000000",
          reason: "Invalid custody settlement",
        },
      });
      expect(rejectCustody.statusCode).toBe(422);
      expect(rejectCustody.json().error.code).toBe("OWNER_SETTLEMENT_CUSTODY_ACCOUNT_NOT_ALLOWED");

      // Option 1: Offset 1,500,000 of 3388 against 1388 -> Dr 3388-OWNER / Cr 1388-OWNER
      const offsetRes = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${org}/banking/owner-settlements`,
        headers: authHeaders(ownerToken, "settle-offset-1"),
        payload: {
          id: "settle-offset-1",
          fiscalYear: 2026,
          effectiveOn: "2026-12-31",
          option: "offset_3388_1388",
          amountMinor: "1500000",
          reason: "Can tru cong no phai tra chu va phai thu chu cuoi nam 2026",
        },
      });
      expect(offsetRes.statusCode, offsetRes.body).toBe(201);
      expect(offsetRes.json().data).toMatchObject({
        option: "offset_3388_1388",
        debitAccountCode: "3388-OWNER",
        creditAccountCode: "1388-OWNER",
        amountMinor: "1500000",
        beforePayable3388Minor: "5000000",
        beforeReceivable1388Minor: "4000000",
        afterPayable3388Minor: "3500000",
        afterReceivable1388Minor: "2500000",
        afterCustody111Minor: "1920000",
      });

      // Option 2: Owner profit distribution of 1,500,000 -> Dr 421-RE / Cr 1388-OWNER
      const profitDistRes = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${org}/banking/owner-settlements`,
        headers: authHeaders(ownerToken, "settle-profit-1"),
        payload: {
          id: "settle-profit-1",
          fiscalYear: 2026,
          effectiveOn: "2026-12-31",
          option: "profit_distribution",
          amountMinor: "1500000",
          reference: "QD-CSH-2026-12",
          reason: "Quyet dinh phan phoi loi nhuan tat toan mot phan phai thu chu 1388",
        },
      });
      expect(profitDistRes.statusCode, profitDistRes.body).toBe(201);
      const pdData = profitDistRes.json().data;
      expect(pdData).toMatchObject({
        option: "profit_distribution",
        debitAccountCode: "421-RE",
        creditAccountCode: "1388-OWNER",
        amountMinor: "1500000",
        afterPayable3388Minor: "3500000",
        afterReceivable1388Minor: "1000000",
      });

      const pdLines = await pool.query<{ account_code: string; debit: string; credit: string }>(
        `select account_code, coalesce(debit_minor,0)::text as debit, coalesce(credit_minor,0)::text as credit
           from journal_lines where organization_id=$1 and journal_id=$2 order by line_number`,
        [org, pdData.journalId],
      );
      expect(pdLines.rows).toEqual([
        { account_code: "421-RE", debit: "1500000", credit: "0" },
        { account_code: "1388-OWNER", debit: "0", credit: "1500000" },
      ]);

      // Reject over-settlement beyond remaining 1,000,000 on 1388
      const overSettle = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${org}/banking/owner-settlements`,
        headers: authHeaders(ownerToken, "settle-over"),
        payload: {
          fiscalYear: 2026,
          effectiveOn: "2026-12-31",
          option: "profit_distribution",
          amountMinor: "2000000",
          reason: "Vuot so du 1388",
        },
      });
      expect(overSettle.statusCode).toBe(422);
      expect(overSettle.json().error.code).toBe("OWNER_SETTLEMENT_AMOUNT_EXCEEDS_BALANCE");

      // Option 3A: Owner repays remaining 1,000,000 on 1388 into company bank -> Dr 112-BANK / Cr 1388-OWNER
      const repay1388 = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${org}/banking/owner-settlements`,
        headers: authHeaders(ownerToken, "settle-repay-1388"),
        payload: {
          id: "settle-repay-1388",
          fiscalYear: 2026,
          effectiveOn: "2026-12-31",
          option: "repayment",
          repaymentDirection: "owner_to_company",
          financialAccountId: "fa-bank",
          amountMinor: "1000000",
          reference: "UNC-OWNER-IN-01",
          reason: "Chu hoan tien phai thu con lai ve VCB cong ty",
        },
      });
      expect(repay1388.statusCode, repay1388.body).toBe(201);
      expect(repay1388.json().data).toMatchObject({
        option: "repayment",
        repaymentDirection: "owner_to_company",
        debitAccountCode: "112-BANK",
        creditAccountCode: "1388-OWNER",
        afterReceivable1388Minor: "0",
        afterPayable3388Minor: "3500000",
      });

      // Option 3B: Company repays remaining 3,500,000 on 3388 from company bank -> Dr 3388-OWNER / Cr 112-BANK
      const repay3388 = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${org}/banking/owner-settlements`,
        headers: authHeaders(ownerToken, "settle-repay-3388"),
        payload: {
          id: "settle-repay-3388",
          fiscalYear: 2026,
          effectiveOn: "2026-12-31",
          option: "repayment",
          financialAccountId: "fa-bank",
          reference: "UNC-COMPANY-OUT-01",
          reason: "Cong ty tat toan so con no chu cuoi nam 2026",
        },
      });
      expect(repay3388.statusCode, repay3388.body).toBe(201);
      expect(repay3388.json().data).toMatchObject({
        option: "repayment",
        repaymentDirection: "company_to_owner",
        debitAccountCode: "3388-OWNER",
        creditAccountCode: "112-BANK",
        amountMinor: "3500000",
        afterPayable3388Minor: "0",
        afterReceivable1388Minor: "0",
        afterCustody111Minor: "1920000",
      });

      // Verify audit events recorded for all 4 settlements and final position is 0 / 0 while 111-OWNER-CUSTODY stays 1,920,000
      const posFinal = await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${org}/banking/owner-settlements/position?fiscalYear=2026&asOf=2026-12-31`,
        headers: authHeaders(ownerToken),
      });
      expect(posFinal.statusCode).toBe(200);
      expect(posFinal.json().data).toMatchObject({
        payable3388Minor: "0",
        receivable1388Minor: "0",
        netOwnerPositionMinor: "0",
        ownerCustody111Minor: "1920000",
        retainedEarnings421Minor: "8500000",
      });
      expect(posFinal.json().data.settlements).toHaveLength(4);

      const audits = await pool.query<{ count: number }>(
        `select count(*)::int as count from resource_audit_events
          where organization_id = $1 and resource_type = 'owner_year_end_settlement'`,
        [org],
      );
      expect(audits.rows[0]?.count).toBe(4);
    });
  },
);
