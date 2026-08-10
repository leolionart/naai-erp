import { createHash } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration("ERP-400 banking PostgreSQL API", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  let app: Awaited<ReturnType<typeof createApp>>;
  const financeToken = "erp400-finance-token";
  const integrationToken = "erp400-integration-token";
  const otherToken = "erp400-other-token";
  const accountInput = {
    id: "erp400-bank-1",
    code: "VCB-VND-01",
    kind: "bank",
    displayName: "VCB operating account",
    currency: "VND",
    ledgerAccountCode: "1121",
    bankCode: "VCB",
    maskedIdentifier: "******6789",
    accountIdentity: "0123456789",
  };
  const csvText = [
    "provider_transaction_id,booking_date,value_date,amount_minor,currency,reference,description,counterparty",
    "VCB-001,2026-08-01,2026-08-01,110000000,VND,INV-001,Client receipt,Client A",
    "VCB-BAD,2026-08-02,2026-08-02,not-money,VND,BAD,Malformed amount,Supplier B",
    "VCB-OTHER-ID,2026-08-01,2026-08-01,110000000,VND,INV-001,Client receipt,Client A",
    "VCB-RISK,2026-08-03,2026-08-03,-250000,VND,FEE-1,@formula-looking memo,VCB",
  ].join("\n");
  const importInput = {
    id: "erp400-import-1",
    financialAccountId: "erp400-bank-1",
    adapterId: "generic-csv",
    adapterVersion: 1,
    filename: "vcb-2026-08.csv",
    csvText,
  };
  const headers = (token: string, key?: string) => ({
    authorization: `Bearer ${token}`,
    ...(key ? { "idempotency-key": key } : {}),
    "x-correlation-id": `corr-${key ?? "read"}`,
  });

  beforeAll(async () => {
    await pool.query(`
      insert into organizations(id,legal_name,base_currency,timezone) values
        ('org-erp400-a','ERP 400 A','VND','Asia/Ho_Chi_Minh'),
        ('org-erp400-b','ERP 400 B','VND','Asia/Ho_Chi_Minh');
      insert into accounts(organization_id,code,name,root_type) values
        ('org-erp400-a','1121','Bank deposits','asset'),
        ('org-erp400-a','642','Administration expense','expense'),
        ('org-erp400-b','1121','Other bank','asset');
    `);
    await pool.query(
      `insert into api_credentials(organization_id,id,actor_id,token_hash,roles) values
       ('org-erp400-a','erp400-finance','erp400-finance-user',$1,'["finance_admin"]'),
       ('org-erp400-a','erp400-integration','erp400-integration-user',$2,'["integration"]'),
       ('org-erp400-b','erp400-other','erp400-other-user',$3,'["finance_admin"]')`,
      [financeToken, integrationToken, otherToken].map((token) =>
        createHash("sha256").update(token).digest("hex"),
      ),
    );
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    await app?.close();
    await pool.end();
  });

  it("creates an organization-scoped bank account exactly once and rejects a non-asset ledger", async () => {
    const request = {
      method: "POST" as const,
      url: "/api/v1/organizations/org-erp400-a/banking/accounts",
      headers: headers(financeToken, "account-create"),
      payload: accountInput,
    };
    const first = await app.inject(request);
    expect(first.statusCode, first.body).toBe(201);
    expect(first.json().data).toMatchObject({
      accountId: "erp400-bank-1",
      idempotencyReplayed: false,
    });
    const replay = await app.inject(request);
    expect(replay.statusCode).toBe(201);
    expect(replay.json().data.idempotencyReplayed).toBe(true);
    const invalid = await app.inject({
      ...request,
      headers: headers(financeToken, "bad-ledger"),
      payload: {
        ...accountInput,
        id: "erp400-bad",
        code: "BAD",
        ledgerAccountCode: "642",
        accountIdentity: "bad",
      },
    });
    expect(invalid.statusCode).toBe(422);
    expect(invalid.json().error.code).toBe("BANK_LEDGER_ACCOUNT_INVALID");
    const counts = await pool.query(`select
      (select count(*)::int from financial_accounts where organization_id='org-erp400-a') accounts,
      (select count(*)::int from resource_audit_events where organization_id='org-erp400-a' and resource_type='financial_account') audits,
      (select count(*)::int from outbox_events where organization_id='org-erp400-a' and event_type='financial_account.created') events`);
    expect(counts.rows[0]).toEqual({ accounts: 1, audits: 1, events: 1 });
  });

  it("dry-runs without mutation then partially imports valid duplicate malformed and risky rows", async () => {
    const before = await pool.query(
      "select count(*)::int count from bank_transactions where organization_id='org-erp400-a'",
    );
    const dryRun = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-erp400-a/banking/imports/dry-run",
      headers: headers(integrationToken),
      payload: importInput,
    });
    expect(dryRun.statusCode, dryRun.body).toBe(201);
    expect(dryRun.json().data).toMatchObject({
      rowCount: 4,
      acceptedCount: 3,
      rejectedCount: 1,
      mutationCount: 0,
    });
    const afterDryRun = await pool.query(
      "select count(*)::int count from bank_transactions where organization_id='org-erp400-a'",
    );
    expect(afterDryRun.rows[0].count).toBe(before.rows[0].count);

    const request = {
      method: "POST" as const,
      url: "/api/v1/organizations/org-erp400-a/banking/imports",
      headers: headers(integrationToken, "import-key-1"),
      payload: importInput,
    };
    const imported = await app.inject(request);
    expect(imported.statusCode, imported.body).toBe(201);
    expect(imported.json().data).toMatchObject({
      importId: "erp400-import-1",
      rowCount: 4,
      importedCount: 2,
      duplicateCount: 1,
      rejectedCount: 1,
      idempotencyReplayed: false,
    });
    const replay = await app.inject(request);
    expect(replay.json().data.idempotencyReplayed).toBe(true);
    const changed = await app.inject({
      ...request,
      payload: { ...importInput, filename: "changed.csv" },
    });
    expect(changed.statusCode).toBe(409);
    const state = await pool.query(`select
      (select count(*)::int from bank_transactions where organization_id='org-erp400-a') transactions,
      (select count(*)::int from bank_transaction_normalizations where organization_id='org-erp400-a') normalizations,
      (select count(*)::int from bank_statement_import_rows where organization_id='org-erp400-a') raw_rows,
      (select count(*)::int from resource_audit_events where organization_id='org-erp400-a' and resource_type='bank_transaction') transaction_audits,
      (select count(*)::int from outbox_events where organization_id='org-erp400-a' and event_type='bank_transaction.imported') transaction_events`);
    expect(state.rows[0]).toEqual({
      transactions: 2,
      normalizations: 2,
      raw_rows: 4,
      transaction_audits: 2,
      transaction_events: 2,
    });
    const risky = await pool.query(
      "select state from bank_transactions where organization_id='org-erp400-a' and provider_transaction_id='VCB-RISK'",
    );
    expect(risky.rows[0].state).toBe("needs_review");
  });

  it("deduplicates the same file under a new idempotency key without effects", async () => {
    const duplicate = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-erp400-a/banking/imports",
      headers: headers(integrationToken, "import-key-new"),
      payload: { ...importInput, id: "erp400-import-other" },
    });
    expect(duplicate.statusCode, duplicate.body).toBe(201);
    expect(duplicate.json().data).toMatchObject({
      importId: "erp400-import-1",
      duplicateFile: true,
    });
    const count = await pool.query(
      "select count(*)::int count from bank_statement_imports where organization_id='org-erp400-a'",
    );
    expect(count.rows[0].count).toBe(1);
  });

  it("enforces organization scope and append-only import history", async () => {
    const crossOrgCredential = await app.inject({
      method: "GET",
      url: "/api/v1/organizations/org-erp400-a/banking/transactions",
      headers: headers(otherToken),
    });
    expect(crossOrgCredential.statusCode).toBe(403);
    const foreignRead = await app.inject({
      method: "GET",
      url: "/api/v1/organizations/org-erp400-b/banking/transactions",
      headers: headers(otherToken),
    });
    expect(foreignRead.statusCode).toBe(200);
    expect(foreignRead.json().data.items).toEqual([]);
    await expect(
      pool.query(
        "update bank_statement_import_rows set raw_payload='{}' where organization_id='org-erp400-a' and import_id='erp400-import-1' and row_number=1",
      ),
    ).rejects.toThrow();
    await expect(
      pool.query(
        "delete from bank_transaction_normalizations where organization_id='org-erp400-a'",
      ),
    ).rejects.toThrow();
  });

  it("transitions imported transactions through an audited idempotent branch action", async () => {
    const transaction = await pool.query<{ id: string }>(
      "select id from bank_transactions where organization_id='org-erp400-a' and state='imported' limit 1",
    );
    const id = transaction.rows[0]!.id;
    const request = {
      method: "POST" as const,
      url: `/api/v1/organizations/org-erp400-a/banking/transactions/${id}/mark-needs-review`,
      headers: headers(financeToken, "needs-review-key"),
      payload: { reason: "Counterparty needs classification" },
    };
    const first = await app.inject(request);
    expect(first.statusCode, first.body).toBe(201);
    expect(first.json().data.state).toBe("needs_review");
    expect((await app.inject(request)).json().data.idempotencyReplayed).toBe(true);
    const event = await pool.query(
      "select count(*)::int count from bank_transaction_events where organization_id='org-erp400-a' and transaction_id=$1",
      [id],
    );
    expect(event.rows[0].count).toBe(1);
  });

  it("classifies owner-current movements from canonical evidence and historical company accounts", async () => {
    await pool.query(`
      insert into accounts(organization_id,code,name,root_type) values
        ('org-erp400-a','3388','Owner current','liability'),
        ('org-erp400-a','111','Owner custody cash','asset'),
        ('org-erp400-a','113','Transfer transit','asset');
      insert into financial_accounts
        (organization_id,id,code,kind,display_name,currency,ledger_account_code,status,created_by,updated_by) values
        ('org-erp400-a','erp883-custody-account','CASH-OWNER-CUSTODY','cash','Owner custody cash','VND','111','active','finance-user','finance-user');
      update financial_accounts set status='inactive'
        where organization_id='org-erp400-a' and id='erp400-bank-1';
      insert into financial_statement_mapping_versions
        (organization_id,id,framework,version,effective_from,state,change_reason,created_by,approved_at,approved_by)
        values('org-erp400-a','erp876-owner-current','TT133',1,'2026-01-01','approved','ERP-876 fixture','finance-user',now(),'finance-user');
      insert into financial_statement_mapping_lines
        (organization_id,mapping_id,mapping_version,line_number,statement,line_code,label,account_code,display_order,sign)
        values('org-erp400-a','erp876-owner-current',1,1,'balance_sheet','owner_current','Owner current','3388',1,1);
      insert into expense_categories(organization_id,code,name,funding_treatment,created_by,updated_by) values
        ('org-erp400-a','OWNER-PAID','Owner paid','owner_paid_company_cost','finance-user','finance-user'),
        ('org-erp400-a','COMPANY-PAID','Company paid','company_funds','finance-user','finance-user');
      insert into parties(organization_id,id,display_name,status) values
        ('org-erp400-a','erp876-supplier','ERP-876 supplier','active');
      insert into journal_entries
        (organization_id,id,journal_date,description,currency,state,version,created_by,approved_at,approved_by,approval_reason,posted_at,posted_by,reversal_of_id) values
        ('org-erp400-a','erp876-owner-expense','2026-08-10','Owner paid expense','VND','posted',2,'finance-user',now(),'finance-user','fixture',now(),'finance-user',null),
        ('org-erp400-a','erp876-wrong-funding','2026-08-11','Wrong funding snapshot','VND','posted',2,'finance-user',now(),'finance-user','fixture',now(),'finance-user',null),
        ('org-erp400-a','owner-repayment-bank-erp876-withdrawal','2026-08-12','Repayment through historical bank','VND','posted',2,'finance-user',now(),'finance-user','fixture',now(),'finance-user',null),
        ('org-erp400-a','erp876-funding','2026-08-13','Owner funds company bank','VND','posted',2,'finance-user',now(),'finance-user','fixture',now(),'finance-user',null),
        ('org-erp400-a','erp876-invoice-only','2026-08-14','Invoice without actual-payment evidence','VND','posted',2,'finance-user',now(),'finance-user','fixture',now(),'finance-user',null),
        ('org-erp400-a','erp876-adjustment','2026-08-15','Unresolved owner adjustment','VND','posted',2,'finance-user',now(),'finance-user','fixture',now(),'finance-user',null),
        ('org-erp400-a','erp876-owner-expense-reversal','2026-08-16','Reverse owner paid expense','VND','posted',2,'finance-user',now(),'finance-user','fixture',now(),'finance-user','erp876-owner-expense'),
        ('org-erp400-a','erp881-legacy-owner-paid','2026-08-17','Legacy owner-paid category','VND','posted',2,'finance-user',now(),'finance-user','fixture',now(),'finance-user',null),
        ('org-erp400-a','erp881-legacy-company-paid','2026-08-18','Legacy company-paid category','VND','posted',2,'finance-user',now(),'finance-user','fixture',now(),'finance-user',null),
        ('org-erp400-a','erp883-custody-settlement','2026-08-19','Owner-held company cash','VND','posted',2,'finance-user',now(),'finance-user','fixture',now(),'finance-user',null),
        ('org-erp400-a','erp883-unsupported-repayment','2026-08-20','Unsupported owner repayment','VND','posted',2,'finance-user',now(),'finance-user','fixture',now(),'finance-user',null);
      insert into journal_lines
        (organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions) values
        ('org-erp400-a','erp876-owner-expense',1,'642',100,null,'Expense','{}'),
        ('org-erp400-a','erp876-owner-expense',2,'3388',null,100,'Owner current','{}'),
        ('org-erp400-a','erp876-wrong-funding',1,'642',60,null,'Expense','{}'),
        ('org-erp400-a','erp876-wrong-funding',2,'3388',null,60,'Owner current','{}'),
        ('org-erp400-a','owner-repayment-bank-erp876-withdrawal',1,'3388',30,null,'Owner current','{}'),
        ('org-erp400-a','owner-repayment-bank-erp876-withdrawal',2,'1121',null,30,'Historical bank','{}'),
        ('org-erp400-a','erp876-funding',1,'1121',80,null,'Historical bank','{}'),
        ('org-erp400-a','erp876-funding',2,'3388',null,80,'Owner current','{}'),
        ('org-erp400-a','erp876-invoice-only',1,'642',50,null,'Purchase expense','{}'),
        ('org-erp400-a','erp876-invoice-only',2,'3388',null,50,'Owner current','{}'),
        ('org-erp400-a','erp876-adjustment',1,'642',40,null,'Unresolved','{}'),
        ('org-erp400-a','erp876-adjustment',2,'3388',null,40,'Owner current','{}'),
        ('org-erp400-a','erp876-owner-expense-reversal',1,'642',null,100,'Reverse expense','{}'),
        ('org-erp400-a','erp876-owner-expense-reversal',2,'3388',100,null,'Reverse owner current','{}'),
        ('org-erp400-a','erp881-legacy-owner-paid',1,'642',25,null,'Legacy owner-paid expense','{}'),
        ('org-erp400-a','erp881-legacy-owner-paid',2,'3388',null,25,'Owner current','{}'),
        ('org-erp400-a','erp881-legacy-company-paid',1,'642',35,null,'Legacy company-paid expense','{}'),
        ('org-erp400-a','erp881-legacy-company-paid',2,'3388',null,35,'Owner current','{}'),
        ('org-erp400-a','erp883-custody-settlement',1,'3388',20,null,'Owner current','{}'),
        ('org-erp400-a','erp883-custody-settlement',2,'1121',null,20,'Historical bank','{}'),
        ('org-erp400-a','erp883-unsupported-repayment',1,'3388',10,null,'Owner current','{}'),
        ('org-erp400-a','erp883-unsupported-repayment',2,'1121',null,10,'Historical bank','{}');
      insert into bank_transactions
        (organization_id,id,financial_account_id,fingerprint,booking_date,amount_minor,currency,description,state) values
        ('org-erp400-a','erp876-withdrawal','erp400-bank-1',repeat('7',64),'2026-08-12',-30,'VND','Personal withdrawal','ignored'),
        ('org-erp400-a','erp883-custody-out','erp400-bank-1',repeat('8',64),'2026-08-19',-20,'VND','Custody transfer out','reconciled'),
        ('org-erp400-a','erp883-custody-in','erp883-custody-account',repeat('9',64),'2026-08-19',20,'VND','Custody transfer in','reconciled');
      insert into internal_transfers
        (organization_id,id,state,currency,transfer_amount_minor,base_principal_amount_minor,transit_account_code,current_attempt_number,created_by) values
        ('org-erp400-a','erp883-custody-transfer','reconciled','VND',20,20,'113',1,'finance-user');
      insert into internal_transfer_attempts
        (organization_id,id,transfer_id,attempt_number,state,posting_mode,outgoing_transaction_id,incoming_transaction_id,matched_by,matched_at,correlation_id,created_by) values
        ('org-erp400-a','erp883-custody-attempt','erp883-custody-transfer',1,'reconciled','direct','erp883-custody-out','erp883-custody-in','finance-user',now(),'erp883','finance-user');
      insert into expenses
        (organization_id,id,expense_class,state,expense_date,business_purpose,currency,net_minor,vat_minor,gross_minor,counter_account_code,journal_id,created_by) values
        ('org-erp400-a','erp876-expense-owner','payroll_personnel','posted','2026-08-10','Payroll paid by owner','VND',100,0,100,'3388','erp876-owner-expense','finance-user'),
        ('org-erp400-a','erp876-expense-company','payroll_personnel','posted','2026-08-11','Payroll marked company funded','VND',60,0,60,'3388','erp876-wrong-funding','finance-user'),
        ('org-erp400-a','erp881-expense-legacy-owner','payroll_personnel','posted','2026-08-17','Legacy owner-paid category','VND',25,0,25,'3388','erp881-legacy-owner-paid','finance-user'),
        ('org-erp400-a','erp881-expense-legacy-company','payroll_personnel','posted','2026-08-18','Legacy company-paid category','VND',35,0,35,'3388','erp881-legacy-company-paid','finance-user');
      insert into expense_lines
        (organization_id,expense_id,line_number,description,net_minor,vat_minor,gross_minor,posting_account_code,expense_category_code,funding_treatment,dimensions) values
        ('org-erp400-a','erp876-expense-owner',1,'Payroll',100,0,100,'642','OWNER-PAID','owner_paid_company_cost','{}'),
        ('org-erp400-a','erp876-expense-company',1,'Payroll',60,0,60,'642','COMPANY-PAID','company_funds','{}'),
        ('org-erp400-a','erp881-expense-legacy-owner',1,'Legacy payroll',25,0,25,'642',null,null,'{"category":"OWNER-PAID"}'),
        ('org-erp400-a','erp881-expense-legacy-company',1,'Legacy payroll',35,0,35,'642',null,null,'{"category":"COMPANY-PAID"}');
      insert into commercial_documents
        (organization_id,id,type,state,document_number,fiscal_year,party_id,document_date,due_date,currency,net_minor,tax_minor,gross_minor,control_account_code,journal_id,created_by) values
        ('org-erp400-a','erp876-purchase-invoice','purchase_invoice','posted','ERP876-PI',2026,'erp876-supplier','2026-08-14','2026-09-14','VND',50,0,50,'3388','erp876-invoice-only','finance-user');
      insert into commercial_document_lines
        (organization_id,document_id,line_number,description,quantity,unit_price_minor,net_minor,tax_minor,gross_minor,primary_account_code,dimensions) values
        ('org-erp400-a','erp876-purchase-invoice',1,'Invoice only',1,50,50,0,50,'642','{}');
    `);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/organizations/org-erp400-a/banking/owner-current-movements",
      headers: headers(financeToken),
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data.summary).toEqual({
      statutoryOwnerCurrentBalanceMinor: "230",
      confirmedSettlementBalanceMinor: "55",
      companyOwesOwnerMinor: "55",
      ownerHoldsCompanyFundsMinor: "0",
      ownerPaidCompanyCostMinor: "25",
      ownerCustodyCashMinor: "20",
      ownerPersonalWithdrawalMinor: "30",
      ownerFundingMinor: "80",
      reviewMinor: "175",
      reviewCount: 5,
    });
    expect(response.json().data.confirmedTimeline).toHaveLength(6);
    expect(response.json().data.reviewItems).toHaveLength(5);
    const byId = Object.fromEntries(
      [...response.json().data.confirmedTimeline, ...response.json().data.reviewItems].map(
        (item: { journalId: string }) => [item.journalId, item],
      ),
    );
    expect(byId["erp876-owner-expense"]).toMatchObject({
      movementType: "owner_paid_company_cost",
      needsReview: false,
      sources: [{ fundingTreatments: ["owner_paid_company_cost"] }],
    });
    expect(byId["owner-repayment-bank-erp876-withdrawal"]).toMatchObject({
      movementType: "owner_personal_withdrawal",
      needsReview: false,
      companyFundsDeltaMinor: "-30",
    });
    expect(byId["erp876-funding"]).toMatchObject({
      movementType: "owner_funding",
      needsReview: false,
    });
    expect(byId["erp876-wrong-funding"]).toMatchObject({
      needsReview: true,
      reviewReason: "missing_source_of_funds_evidence",
    });
    expect(byId["erp876-invoice-only"]).toMatchObject({
      needsReview: true,
      reviewReason: "missing_source_of_funds_evidence",
      sources: [{ sourceType: "purchase_invoice" }],
    });
    expect(byId["erp876-owner-expense-reversal"]).toMatchObject({
      movementType: "owner_paid_company_cost",
      needsReview: false,
      ownerDeltaMinor: "-100",
      runningConfirmedSettlementBalanceMinor: "50",
    });
    expect(byId["erp876-owner-expense"]).toMatchObject({
      runningConfirmedSettlementBalanceMinor: "100",
    });
    expect(byId["owner-repayment-bank-erp876-withdrawal"]).toMatchObject({
      runningConfirmedSettlementBalanceMinor: "70",
    });
    expect(byId["erp876-funding"]).toMatchObject({ runningConfirmedSettlementBalanceMinor: "150" });
    expect(byId["erp881-legacy-owner-paid"]).toMatchObject({
      movementType: "owner_paid_company_cost",
      needsReview: false,
      runningConfirmedSettlementBalanceMinor: "75",
      sources: [
        {
          category: "OWNER-PAID",
          fundingTreatments: ["owner_paid_company_cost"],
        },
      ],
    });
    expect(byId["erp881-legacy-company-paid"]).toMatchObject({
      needsReview: true,
      reviewReason: "missing_source_of_funds_evidence",
      sources: [{ category: "COMPANY-PAID", fundingTreatments: ["company_funds"] }],
    });
    expect(byId["erp883-custody-settlement"]).toMatchObject({
      movementType: "owner_custody_cash",
      needsReview: false,
      runningConfirmedSettlementBalanceMinor: "55",
    });
    expect(byId["erp883-unsupported-repayment"]).toMatchObject({
      needsReview: true,
      proposedMovementType: "company_repayment_to_owner",
      reviewReason: "unsupported_company_repayment",
    });
  });
});
