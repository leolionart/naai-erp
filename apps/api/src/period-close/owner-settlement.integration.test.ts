import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";
import { authHeaders, seedPeriodCloseTestOrg } from "./period-close-test-fixture.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && Boolean(process.env.DATABASE_URL);
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration(
  "T-INT-CLOSE-001 year-end owner position and audited settlement options",
  () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const org = `org-987-ys-${randomUUID()}`;
    const ownerToken = `tok-987-ys-${org}`;
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
         values ($1,'j-seed-ys','2026-08-01','Von, quy chu giu va LN giu lai','VND','posted',2,'owner-1',now(),'owner-1','seed',now(),'owner-1')`,
        [org],
      );
      await pool.query(
        `insert into journal_lines(organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions) values
           ($1,'j-seed-ys',1,'112-BANK',48080000,null,'Bank opening','{}'),
           ($1,'j-seed-ys',2,'111-OWNER-CUSTODY',1920000,null,'Custody opening','{}'),
           ($1,'j-seed-ys',3,'411-CAPITAL',null,40000000,'Capital','{}'),
           ($1,'j-seed-ys',4,'421-RE',null,10000000,'Retained earnings','{}')`,
        [org],
      );
    });

    afterAll(async () => {
      await app?.close();
      await pool.end();
    });

    it("reports year-end owner position (3388, 1388, 111-OWNER-CUSTODY) and settles via offset, profit distribution (Dr 421 / Cr 1388), and repayment", async () => {
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
