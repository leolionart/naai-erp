import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";
import {
  applyMigration0076,
  authHeaders,
  seedOwnerCustodyBaseOrg,
} from "./owner-custody-test-fixture.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && Boolean(process.env.DATABASE_URL);
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration("T-INT-FUND-007 dedicated 111-OWNER-CUSTODY and 1388 owner receivable", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const org = `org-980-${randomUUID()}`;
  const ownerToken = `tok-980-${org}`;
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeAll(async () => {
    await seedOwnerCustodyBaseOrg(pool, org, ownerToken);
    await applyMigration0076(pool, org);
    await pool.query(
      `insert into financial_statement_mapping_lines(organization_id,mapping_id,mapping_version,line_number,statement,line_code,label,account_code,display_order,sign)
       values ($1,'map-tt133',1,20,'balance_sheet','cash','Quy tien mat cong ty','111-CASH',11,1)
       on conflict do nothing`,
      [org],
    );
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await pool.end();
  });

  it("seeds 111-OWNER-CUSTODY under 111, maps CASH-OWNER-CUSTODY and CASH-COMPANY, posts transfers/expenses/invoices, and tracks 1388 outside P&L/VAT/CIT", async () => {
    const edges = await pool.query<{ child_code: string; parent_code: string }>(
      `select child_code, parent_code from account_hierarchy_edges where organization_id=$1 order by child_code`,
      [org],
    );
    expect(edges.rows).toEqual(
      expect.arrayContaining([
        { child_code: "111-CASH", parent_code: "111" },
        { child_code: "111-OWNER-CUSTODY", parent_code: "111" },
        { child_code: "1388-OWNER", parent_code: "1388" },
      ]),
    );

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

    const faRows = await pool.query<{ code: string; ledger_account_code: string }>(
      `select code, ledger_account_code from financial_accounts where organization_id=$1 order by code`,
      [org],
    );
    expect(faRows.rows).toEqual([
      { code: "BANK-MAIN", ledger_account_code: "112-BANK" },
      { code: "CASH-COMPANY", ledger_account_code: "111-CASH" },
      { code: "CASH-OWNER-CUSTODY", ledger_account_code: "111-OWNER-CUSTODY" },
    ]);

    await pool.query(
      `insert into journal_entries(organization_id,id,journal_date,description,currency,state,version,created_by,approved_at,approved_by,approval_reason,posted_at,posted_by)
       values ($1,'j-seed-bank','2026-08-01','Von va doanh thu','VND','posted',2,'owner-1',now(),'owner-1','seed',now(),'owner-1')`,
      [org],
    );
    await pool.query(
      `insert into journal_lines(organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions) values
         ($1,'j-seed-bank',1,'112-BANK',20000000,null,'Bank in','{}'),
         ($1,'j-seed-bank',2,'411-CAPITAL',null,10000000,'Capital','{}'),
         ($1,'j-seed-bank',3,'511-REV',null,10000000,'Revenue','{}')`,
      [org],
    );

    await pool.query(
      `insert into bank_transactions(organization_id,id,financial_account_id,fingerprint,booking_date,amount_minor,currency,description,state) values
         ($1,'tx-b2c-out','fa-bank',repeat('1',64),'2026-08-02',-3000000,'VND','Rut nhap ket','imported'),
         ($1,'tx-b2c-in','fa-cash-company',repeat('2',64),'2026-08-02',3000000,'VND','Nhap ket','imported'),
         ($1,'tx-b2o-out','fa-bank',repeat('3',64),'2026-08-03',-5000000,'VND','Giao quy chu giu','imported'),
         ($1,'tx-b2o-in','fa-cash-custody',repeat('4',64),'2026-08-03',5000000,'VND','Nhan quy chu giu','imported')`,
      [org],
    );
    const tCompany = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${org}/banking/internal-transfers`,
      headers: authHeaders(ownerToken, "it-company"),
      payload: {
        schemaVersion: 1,
        id: "it-b2c",
        postingMode: "direct",
        sourceTransactionId: "tx-b2c-out",
        destinationTransactionId: "tx-b2c-in",
        currency: "VND",
        principalAmountMinor: "3000000",
        basePrincipalAmountMinor: "3000000",
        transitAccountId: "113-TRANSIT",
        reason: "Rut tien nhap ket cong ty",
      },
    });
    expect(tCompany.statusCode, tCompany.body).toBe(201);

    const tCustody = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${org}/banking/internal-transfers`,
      headers: authHeaders(ownerToken, "it-custody"),
      payload: {
        schemaVersion: 1,
        id: "it-b2o",
        postingMode: "direct",
        sourceTransactionId: "tx-b2o-out",
        destinationTransactionId: "tx-b2o-in",
        currency: "VND",
        principalAmountMinor: "5000000",
        basePrincipalAmountMinor: "5000000",
        transitAccountId: "113-TRANSIT",
        reason: "Giao tien mat cong ty cho chu giu",
      },
    });
    expect(tCustody.statusCode, tCustody.body).toBe(201);
    const custodyTransferJournalId = tCustody.json().data.transfer.attempts[0].journalIds[0];
    const custodyTransferLines = await pool.query<{
      account_code: string;
      debit: string;
      credit: string;
    }>(
      `select account_code, coalesce(debit_minor,0)::text as debit, coalesce(credit_minor,0)::text as credit
         from journal_lines where organization_id=$1 and journal_id=$2 order by line_number`,
      [org, custodyTransferJournalId],
    );
    expect(custodyTransferLines.rows).toEqual([
      { account_code: "111-OWNER-CUSTODY", debit: "5000000", credit: "0" },
      { account_code: "112-BANK", debit: "0", credit: "5000000" },
    ]);

    const expCustody = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${org}/expenses`,
      headers: authHeaders(ownerToken, "exp-custody-1"),
      payload: {
        id: "exp-custody-1",
        expenseClass: "invoice_backed",
        payeePartyId: "SUP-1",
        expenseDate: "2026-08-05",
        businessPurpose: "Mua VPP tu quy chu giu",
        currency: "VND",
        netMinor: "1000000",
        vatMinor: "100000",
        grossMinor: "1100000",
        counterAccountCode: "",
        funding: { type: "owner_custody_cash", financialAccountId: "fa-cash-custody" },
        externalReference: { system: "paperless", externalId: "doc-exp-custody-1" },
        lines: [
          {
            description: "Van phong pham",
            netMinor: "1000000",
            vatMinor: "100000",
            grossMinor: "1100000",
            postingAccountCode: "642-OPEX",
            vatAccountCode: "1331-VAT",
            expenseCategoryCode: "OFFICE",
            vatState: "eligible",
            vatEligibleMinor: "100000",
            citState: "eligible",
            citEligibleMinor: "1000000",
            allocations: [
              { id: "a1", amountMinor: "1000000", dimensions: { costCenter: "ADMIN" } },
            ],
          },
        ],
      },
    });
    expect(expCustody.statusCode, expCustody.body).toBe(201);
    const expCustodyLines = await pool.query<{
      account_code: string;
      debit: string;
      credit: string;
    }>(
      `select account_code, coalesce(debit_minor,0)::text as debit, coalesce(credit_minor,0)::text as credit
         from journal_lines where organization_id=$1 and journal_id=$2 order by line_number`,
      [org, expCustody.json().data.journalId],
    );
    expect(expCustodyLines.rows).toEqual([
      { account_code: "642-OPEX", debit: "1000000", credit: "0" },
      { account_code: "1331-VAT", debit: "100000", credit: "0" },
      { account_code: "111-OWNER-CUSTODY", debit: "0", credit: "1100000" },
    ]);

    const expCompany = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${org}/expenses`,
      headers: authHeaders(ownerToken, "exp-company-1"),
      payload: {
        id: "exp-company-1",
        expenseClass: "receipt_backed",
        payeePartyId: "SUP-1",
        expenseDate: "2026-08-06",
        businessPurpose: "Gui xe tu ket cong ty",
        currency: "VND",
        netMinor: "400000",
        vatMinor: "0",
        grossMinor: "400000",
        counterAccountCode: "",
        funding: { type: "company_cash", financialAccountId: "fa-cash-company" },
        lines: [
          {
            description: "Gui xe",
            netMinor: "400000",
            vatMinor: "0",
            grossMinor: "400000",
            postingAccountCode: "642-OPEX",
            expenseCategoryCode: "OFFICE",
            citState: "eligible",
            citEligibleMinor: "400000",
            allocations: [{ id: "a2", amountMinor: "400000", dimensions: { costCenter: "ADMIN" } }],
          },
        ],
      },
    });
    expect(expCompany.statusCode, expCompany.body).toBe(201);

    const piCustody = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${org}/commercial-documents`,
      headers: authHeaders(ownerToken, "pi-custody-1"),
      payload: {
        id: "pi-custody-1",
        type: "purchase_invoice",
        documentNumber: "PI-CUST-001",
        fiscalYear: 2026,
        partyId: "SUP-1",
        documentDate: "2026-08-07",
        dueDate: "2026-08-07",
        currency: "VND",
        netMinor: "500000",
        taxMinor: "50000",
        grossMinor: "550000",
        controlAccountCode: "331-AP",
        funding: { type: "owner_custody_cash", financialAccountId: "fa-cash-custody" },
        externalReference: { system: "paperless", externalId: "doc-pi-custody-1" },
        lines: [
          {
            description: "Dich vu in an",
            quantity: "1",
            unitPriceMinor: "500000",
            netMinor: "500000",
            taxMinor: "50000",
            grossMinor: "550000",
            primaryAccountCode: "642-OPEX",
            taxAccountCode: "1331-VAT",
            taxCode: "VAT10_IN",
            allocations: [
              {
                id: "pi-a1",
                amountMinor: "500000",
                dimensions: { costCenter: "ADMIN", taxState: "eligible" },
              },
            ],
          },
        ],
      },
    });
    expect(piCustody.statusCode, piCustody.body).toBe(201);
    expect(piCustody.json().data.state).toBe("paid");
    const piRow = await pool.query<{ control_account_code: string }>(
      `select control_account_code from commercial_documents where organization_id=$1 and id='pi-custody-1'`,
      [org],
    );
    expect(piRow.rows[0]?.control_account_code).toBe("111-OWNER-CUSTODY");

    const expOwnerPaid = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${org}/expenses`,
      headers: authHeaders(ownerToken, "exp-owner-paid-1"),
      payload: {
        id: "exp-owner-paid-1",
        expenseClass: "receipt_backed",
        payeePartyId: "SUP-1",
        expenseDate: "2026-08-08",
        businessPurpose: "Chu chi ho tiep khach",
        currency: "VND",
        netMinor: "900000",
        vatMinor: "0",
        grossMinor: "900000",
        counterAccountCode: "",
        funding: { type: "owner_paid" },
        lines: [
          {
            description: "Tiep khach",
            netMinor: "900000",
            vatMinor: "0",
            grossMinor: "900000",
            postingAccountCode: "642-OPEX",
            expenseCategoryCode: "OWNER_ADV",
            citState: "eligible",
            citEligibleMinor: "900000",
            allocations: [{ id: "a3", amountMinor: "900000", dimensions: { costCenter: "ADMIN" } }],
          },
        ],
      },
    });
    expect(expOwnerPaid.statusCode, expOwnerPaid.body).toBe(201);

    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/v1/organizations/${org}/expenses`,
          headers: authHeaders(ownerToken, "exp-personal-bad-acct"),
          payload: {
            expenseClass: "owner_personal",
            expenseDate: "2026-08-09",
            businessPurpose: "Chi ca nhan sai TK",
            currency: "VND",
            netMinor: "200000",
            vatMinor: "0",
            grossMinor: "200000",
            counterAccountCode: "",
            funding: { type: "owner_custody_cash", financialAccountId: "fa-cash-custody" },
            lines: [
              {
                description: "An ca nhan",
                netMinor: "200000",
                vatMinor: "0",
                grossMinor: "200000",
                postingAccountCode: "642-OPEX",
                allocations: [
                  { id: "ap-bad", amountMinor: "200000", dimensions: { costCenter: "OWNER" } },
                ],
              },
            ],
          },
        })
      ).statusCode,
    ).toBe(422);

    const expPersonal = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${org}/expenses`,
      headers: authHeaders(ownerToken, "exp-personal-1"),
      payload: {
        id: "exp-personal-1",
        expenseClass: "owner_personal",
        expenseDate: "2026-08-09",
        businessPurpose: "Chi tieu ca nhan cua chu lay tu quy chu giu",
        currency: "VND",
        netMinor: "500000",
        vatMinor: "50000",
        grossMinor: "550000",
        counterAccountCode: "",
        funding: { type: "owner_custody_cash", financialAccountId: "fa-cash-custody" },
        lines: [
          {
            description: "Mua do ca nhan",
            netMinor: "500000",
            vatMinor: "50000",
            grossMinor: "550000",
            postingAccountCode: "1388",
            vatAccountCode: "1331-VAT",
            allocations: [
              { id: "ap-1", amountMinor: "500000", dimensions: { costCenter: "OWNER" } },
            ],
          },
        ],
      },
    });
    expect(expPersonal.statusCode, expPersonal.body).toBe(201);
    const personalLines = await pool.query<{
      account_code: string;
      debit: string;
      credit: string;
    }>(
      `select account_code, coalesce(debit_minor,0)::text as debit, coalesce(credit_minor,0)::text as credit
         from journal_lines where organization_id=$1 and journal_id=$2 order by line_number`,
      [org, expPersonal.json().data.journalId],
    );
    expect(personalLines.rows).toEqual([
      { account_code: "1388", debit: "550000", credit: "0" },
      { account_code: "111-OWNER-CUSTODY", debit: "0", credit: "550000" },
    ]);

    const asOfInstant = encodeURIComponent("2026-12-31T23:59:59.000Z");
    const [pnlRes, bsRes, vatRes, dashRes, dashAsOfEarlyRes, ownerMovRes] = await Promise.all([
      app.inject({
        method: "GET",
        url: `/api/v1/organizations/${org}/reports/financial-statements/profit-and-loss?startsOn=2026-08-01&endsOn=2026-08-31&asOfInstant=${asOfInstant}&framework=TT133`,
        headers: authHeaders(ownerToken),
      }),
      app.inject({
        method: "GET",
        url: `/api/v1/organizations/${org}/reports/financial-statements/balance-sheet?endsOn=2026-08-31&asOfInstant=${asOfInstant}&framework=TT133`,
        headers: authHeaders(ownerToken),
      }),
      app.inject({
        method: "GET",
        url: `/api/v1/organizations/${org}/reports/tax/vat-reconciliation?startsOn=2026-08-01&endsOn=2026-08-31&asOfInstant=${asOfInstant}&framework=TT133`,
        headers: authHeaders(ownerToken),
      }),
      app.inject({
        method: "GET",
        url: `/api/v1/organizations/${org}/reports/operating-dashboard?asOf=2026-08-31&startsOn=2026-08-01&endsOn=2026-08-31`,
        headers: authHeaders(ownerToken),
      }),
      app.inject({
        method: "GET",
        url: `/api/v1/organizations/${org}/reports/operating-dashboard?asOf=2026-08-05&startsOn=2026-08-01&endsOn=2026-08-31`,
        headers: authHeaders(ownerToken),
      }),
      app.inject({
        method: "GET",
        url: `/api/v1/organizations/${org}/banking/owner-current-movements`,
        headers: authHeaders(ownerToken),
      }),
    ]);

    expect(pnlRes.statusCode, pnlRes.body).toBe(200);
    expect(pnlRes.json().data).toMatchObject({
      revenueMinor: "10000000",
      operatingExpenseMinor: "2800000",
      netProfitMinor: "7200000",
    });

    expect(bsRes.statusCode, bsRes.body).toBe(200);
    expect(bsRes.json().data.equationDifferenceMinor).toBe("0");
    expect(bsRes.json().data.assetRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "111-CASH", amountMinor: "2600000" }),
        expect.objectContaining({ key: "111-OWNER-CUSTODY", amountMinor: "2800000" }),
        expect.objectContaining({ key: "1388", amountMinor: "550000" }),
      ]),
    );

    expect(vatRes.statusCode, vatRes.body).toBe(200);
    expect(vatRes.json().data).toMatchObject({
      eligibleInputVatMinor: "150000",
      unreviewedInputVatMinor: "0",
    });

    expect(dashRes.statusCode, dashRes.body).toBe(200);
    expect(dashRes.json().data.financials).toMatchObject({
      revenueMinor: "10000000",
      expenseMinor: "2800000",
      netProfitMinor: "7200000",
      taxableProfitMinor: "7200000",
      corporateIncomeTaxMinor: "1080000", // 15% tier of BR-TAX-102 (no prior-year revenue)
      bankAvailableMinor: "12000000",
      companyCashOnHandMinor: "2600000",
      ownerCashCustodyMinor: "2800000",
      ownerHoldsCompanyFundsMinor: "1900000", // custody 2.8M net of the 0.9M still owed to the owner (ERP-1003)
      cashOnHandMinor: "5400000",
      cashAndBankMinor: "17400000",
      totalCompanyFundsMinor: "16500000",
      companyFundsReconciliationGapMinor: "0",
      statutoryOwnerCurrentBalanceMinor: "900000",
      ownerReceivableMinor: "550000",
      netOwnerPositionMinor: "350000",
    });

    expect(dashAsOfEarlyRes.json().data.financials.ownerCashCustodyMinor).toBe("3900000");

    expect(ownerMovRes.statusCode, ownerMovRes.body).toBe(200);
    expect(ownerMovRes.json().data.ledgerBalances).toEqual({
      ownerCustodyCashMinor: "2800000",
      companyCashOnHandMinor: "2600000",
      ownerPayableMinor: "900000",
      ownerReceivableMinor: "550000",
      netOwnerPositionMinor: "350000",
    });
    expect(ownerMovRes.json().data.summary.ownerHoldsCompanyFundsMinor).toBe("1900000");
  });
});
