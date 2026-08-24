import { createHash } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && Boolean(process.env.DATABASE_URL);
const suite = enabled ? describe : describe.skip;

suite("operating dashboard PostgreSQL API", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const org = `org-operating-dashboard-${process.pid}`,
    owner = `${org}-owner`,
    token = `operating-dashboard-token-${process.pid}`;
  let app: Awaited<ReturnType<typeof createApp>>;
  beforeAll(async () => {
    await pool.query(`
      insert into organizations(id,legal_name,base_currency,timezone) values('${org}','Operating Dashboard','VND','Asia/Ho_Chi_Minh');
      insert into users(id,email,display_name) values('${owner}','${process.pid}@example.com','Owner');
      insert into organization_memberships(organization_id,user_id) values('${org}','${owner}');
      insert into membership_roles(organization_id,user_id,role) values('${org}','${owner}','owner');
      insert into accounts(organization_id,code,name,root_type,is_control_account,allow_manual_posting) values
        ('${org}','131','Receivables','asset',true,false),('${org}','511','Revenue','revenue',false,true),
        ('${org}','642','Expense','expense',false,true),('${org}','211','Equipment','asset',false,true),('${org}','3388','Owner payable','liability',false,true),
        ('${org}','112','Bank','asset',false,true),('${org}','3331','Output VAT','liability',false,true);
      insert into financial_accounts(organization_id,id,code,kind,display_name,currency,ledger_account_code,bank_code,status,created_by,updated_by) values
        ('${org}','bank','BANK','bank','Bank','VND','112','TESTBANK','active','${owner}','${owner}');
      insert into expense_categories(organization_id,code,name,funding_treatment,created_by,updated_by) values
        ('${org}','OWNER-ACTUAL','Owner-paid actual','owner_paid_company_cost','${owner}','${owner}'),
        ('${org}','TAX-ONLY','Tax-only invoice','tax_only_non_cash','${owner}','${owner}'),
        ('${org}','COMPANY','Company funded','company_funds','${owner}','${owner}');
      insert into financial_statement_mapping_versions(organization_id,id,framework,version,effective_from,state,change_reason,created_by,approved_at,approved_by) values
        ('${org}','tt133-dashboard','TT133',1,'2026-01-01','approved','Dashboard fixture','${owner}',now(),'${owner}');
      insert into financial_statement_mapping_lines(organization_id,mapping_id,mapping_version,line_number,statement,line_code,label,account_code,display_order,sign) values
        ('${org}','tt133-dashboard',1,1,'balance_sheet','owner_current','Owner current account','3388',1,1);
      insert into parties(organization_id,id,display_name,status) values('${org}','client','Client','active');
      insert into projects(organization_id,id,code,name,client_party_id,owner_user_id,contract_type,currency,budget_minor,starts_on,state)
        values('${org}','project','OPS','Project','client','${owner}','fixed_fee','VND',2000,'2026-01-01','active');
      insert into contracts(organization_id,id,project_id,reference,signed_on,value_minor,currency)
        values('${org}','contract','project','OPS-C','2026-01-01',2000,'VND');
      insert into journal_entries(organization_id,id,journal_date,description,currency,state,version,created_by,approved_at,approved_by,approval_reason,posted_at,posted_by)
        values('${org}','sales-journal','2026-07-01','Invoice','VND','posted',2,'${owner}',now(),'${owner}','fixture',now(),'${owner}'),
        ('${org}','owner-expense-journal','2026-07-02','Owner actual','VND','posted',2,'${owner}',now(),'${owner}','fixture',now(),'${owner}'),
        ('${org}','tax-expense-journal','2026-07-03','Tax only','VND','posted',2,'${owner}',now(),'${owner}','fixture',now(),'${owner}'),
        ('${org}','company-expense-journal','2026-07-04','Company cost','VND','posted',2,'${owner}',now(),'${owner}','fixture',now(),'${owner}'),
        ('${org}','unclassified-expense-journal','2026-07-05','Unclassified','VND','posted',2,'${owner}',now(),'${owner}','fixture',now(),'${owner}'),
        ('${org}','owner-equipment-journal','2026-07-06','Owner contributed equipment','VND','posted',2,'${owner}',now(),'${owner}','fixture',now(),'${owner}'),
        ('${org}','owner-repayment-journal','2026-07-07','Cash withdrawn as owner repayment','VND','posted',2,'${owner}',now(),'${owner}','fixture',now(),'${owner}'),
        ('${org}','receipt-journal','2026-07-08','Partial customer receipt','VND','posted',2,'${owner}',now(),'${owner}','fixture',now(),'${owner}');
      insert into journal_lines(organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions) values
        ('${org}','sales-journal',1,'131',1100,null,'AR','{}'),('${org}','sales-journal',2,'511',null,1000,'Revenue','{}'),('${org}','sales-journal',3,'3331',null,100,'VAT','{}'),
        ('${org}','owner-expense-journal',1,'642',100,null,'Owner actual','{}'),('${org}','owner-expense-journal',2,'3388',null,100,'Owner payable','{}'),
        ('${org}','tax-expense-journal',1,'642',200,null,'Tax only','{}'),('${org}','tax-expense-journal',2,'3388',null,200,'Owner payable','{}'),
        ('${org}','company-expense-journal',1,'642',300,null,'Company','{}'),('${org}','company-expense-journal',2,'112',null,300,'Bank','{}'),
        ('${org}','unclassified-expense-journal',1,'642',50,null,'Unclassified','{}'),('${org}','unclassified-expense-journal',2,'3388',null,50,'Owner payable','{}'),
        ('${org}','owner-equipment-journal',1,'211',500,null,'Equipment','{}'),('${org}','owner-equipment-journal',2,'3388',null,500,'Owner equipment','{}'),
        ('${org}','owner-repayment-journal',1,'3388',40,null,'Owner repayment','{}'),('${org}','owner-repayment-journal',2,'112',null,40,'Bank withdrawal','{}'),
        ('${org}','receipt-journal',1,'112',550,null,'Receipt','{}'),('${org}','receipt-journal',2,'131',null,550,'Settle AR','{}');
      insert into expenses(organization_id,id,expense_class,state,expense_date,business_purpose,currency,net_minor,vat_minor,gross_minor,counter_account_code,journal_id,created_by) values
        ('${org}','owner-expense','invoice_backed','posted','2026-07-02','Owner actual','VND',100,0,100,'3388','owner-expense-journal','${owner}'),
        ('${org}','tax-expense','invoice_backed','posted','2026-07-03','Tax only','VND',200,0,200,'3388','tax-expense-journal','${owner}'),
        ('${org}','company-expense','invoice_backed','posted','2026-07-04','Company','VND',300,0,300,'112','company-expense-journal','${owner}'),
        ('${org}','unclassified-expense','invoice_backed','posted','2026-07-05','Unclassified','VND',50,0,50,'3388','unclassified-expense-journal','${owner}'),
        ('${org}','draft-owner-expense','invoice_backed','draft','2026-07-06','Draft','VND',400,0,400,'3388',null,'${owner}');
      insert into expense_lines(organization_id,expense_id,line_number,description,net_minor,vat_minor,gross_minor,posting_account_code,expense_category_code,funding_treatment,dimensions) values
        ('${org}','owner-expense',1,'Owner actual',100,0,100,'642','OWNER-ACTUAL','owner_paid_company_cost','{}'),
        ('${org}','tax-expense',1,'Tax only',200,0,200,'642','TAX-ONLY','tax_only_non_cash','{}'),
        ('${org}','company-expense',1,'Company',300,0,300,'642','COMPANY','company_funds','{}'),
        ('${org}','unclassified-expense',1,'Unclassified',50,0,50,'642',null,null,'{}'),
        ('${org}','draft-owner-expense',1,'Draft',400,0,400,'642','OWNER-ACTUAL','owner_paid_company_cost','{}');
      insert into commercial_documents(organization_id,id,type,state,document_number,series,fiscal_year,party_id,document_date,due_date,currency,net_minor,tax_minor,gross_minor,control_account_code,journal_id,created_by)
        values('${org}','invoice','sales_invoice','partially_paid','OPS-1','OPS',2026,'client','2026-07-01','2026-07-31','VND',1000,100,1100,'131','sales-journal','${owner}'),
        ('${org}','future-invoice','sales_invoice','issued','OPS-2','OPS',2026,'client','2026-10-01','2026-10-31','VND',700,0,700,'131',null,'${owner}');
      insert into commercial_document_lines(organization_id,document_id,line_number,description,quantity,unit_price_minor,net_minor,tax_minor,gross_minor,primary_account_code,tax_account_code,dimensions)
        values('${org}','invoice',1,'Service',1,1000,1000,100,1100,'511','3331','{"projectId":"project"}'),
        ('${org}','future-invoice',1,'Future service',1,700,700,0,700,'511',null,'{"projectId":"project"}');
      insert into commercial_document_allocations(organization_id,document_id,line_number,allocation_number,amount_minor,dimensions)
        values('${org}','invoice',1,1,1000,'{"projectId":"project"}'),
        ('${org}','future-invoice',1,1,700,'{"projectId":"project"}');
      insert into customer_receipts(organization_id,id,financial_account_id,receipt_date,amount_minor,currency,description,state,journal_id,customer_id,created_by,correlation_id)
        values('${org}','receipt','bank','2026-07-08',550,'VND','Partial receipt','posted','receipt-journal','client','${owner}','receipt-fixture');
      insert into customer_receipt_allocations(organization_id,id,receipt_id,sales_invoice_id,amount_minor)
        values('${org}','receipt-allocation','receipt','invoice',550);
      insert into workbook_import_review_rows(organization_id,id,import_identity,source_identity,workbook,sheet,source_row,kind,proposed_resource_type,status,review_flags,raw_data,mapped_data,created_by,updated_by)
        values
        ('${org}','review','import','source','source.xlsx','Sheet1',2,'sales','commercial_document','pending_review','["missing_project"]','{}','{}','${owner}','${owner}'),
        ('${org}','control-profit','import','control-profit','finance','Tỷ suất lợi nhuận',2,'profitability_control','profitability_control','pending_review','["control_only"]','{}','{"sourceControl":{"workbook":"finance","sheet":"Tỷ suất lợi nhuận","row":2},"period":"2025-01","revenueMinor":"1000","receivedMinor":"900","expenseMinor":"400","profitMinor":"600"}','${owner}','${owner}'),
        ('${org}','control-plan','import','control-plan','finance','Planing & Target',2,'planning_control','planning_control','pending_review','["control_only"]','{}','{"sourceControl":{"workbook":"finance","sheet":"Planing & Target","row":2},"period":"2025-01","revenueMinor":"1000","receivedMinor":"900","expenseMinor":"450","profitMinor":"550","targetAttainmentBps":4000,"forecastExpenseMinor":"500","forecastCashMinor":"400"}','${owner}','${owner}'),
        ('${org}','control-debt','import','control-debt','finance','Công nợ',2,'debt_control','ar_control','pending_review','["control_only"]','{}','{"sourceControl":{"workbook":"finance","sheet":"Công nợ","row":2},"period":"2025-01","projectLabel":"Project","debtMinor":"100","projectCostMinor":"2000","collectedMinor":"1900"}','${owner}','${owner}'),
        ('${org}','control-bonus','import','control-bonus','finance','Tỉ lệ thưởng',2,'bonus_control','bonus_control','pending_review','["control_only"]','{}','{"sourceControl":{"workbook":"finance","sheet":"Tỉ lệ thưởng","row":2},"period":"2025-01","personName":"Owner","bonusMinor":"50","revenueMinor":"1000"}','${owner}','${owner}'),
        ('${org}','control-category','import','control-category','finance','Hạng mục chi',2,'expense_category_control','expense_category_control','pending_review','["control_only"]','{}','{"sourceControl":{"workbook":"finance","sheet":"Hạng mục chi","row":2},"category":"Payroll","monthlyAmounts":[{"period":"2025-01","amountMinor":"300"}]}','${owner}','${owner}');
    `);
    await pool.query(
      `insert into api_credentials(organization_id,id,actor_id,token_hash,roles) values($1,'credential',$2,$3,'["owner"]')`,
      [org, owner, createHash("sha256").update(token).digest("hex")],
    );
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    await app?.close();
    await pool.end();
  });

  it("serves an organization-scoped derived dashboard from existing accounting data", async () => {
    const before = (
      await pool.query(
        `select
          (select count(*)::int from journal_entries where organization_id=$1) journals,
          (select count(*)::int from commercial_documents where organization_id=$1) documents,
          (select count(*)::int from expenses where organization_id=$1) expenses,
          (select count(*)::int from reconciliation_attempts where organization_id=$1) reconciliations`,
        [org],
      )
    ).rows[0];
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/organizations/${org}/reports/operating-dashboard?asOf=2026-08-06&startsOn=2026-01-01&endsOn=2026-08-06`,
      headers: { authorization: `Bearer ${token}`, "x-correlation-id": "dashboard-test" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      requestId: "dashboard-test",
      organizationId: org,
      data: {
        schemaVersion: 1,
        asOf: "2026-08-06",
        backlog: {
          contractedMinor: "2000",
          invoicedMinor: "1000",
          remainingMinor: "1000",
          projects: [{ projectId: "project", collectedMinor: "500" }],
        },
        collections: { receivablesMinor: "550", overdueMinor: "550" },
        clientConcentration: { totalRevenueMinor: "1000", topClientShareBps: 10000 },
        financials: {
          revenueMinor: "1000",
          expenseMinor: "650",
          netProfitMinor: "350",
          unrestrictedCashMinor: null,
          bankAvailableMinor: "210",
          cashOnHandMinor: "0",
          cashAndBankMinor: "210",
          ownerPayableMinor: "100",
          statutoryOwnerCurrentBalanceMinor: "810",
          ownerOperatingPayableMinor: "100",
          confirmedOwnerSettlementMinor: "100",
          ownerHoldsCompanyFundsMinor: "0",
          netAvailableCashMinor: "110",
          actualOwnerPaidCompanyCostMinor: "100",
          netCompanyFundsMinor: "110",
          unclassifiedOwnerPaidCount: 1,
          unclassifiedOwnerPaidMinor: "50",
          ownerPaidClassificationStatus: "review_required",
          corporateIncomeTaxRateBps: null,
          rosBps: 3500,
          recognitionEventCount: 0,
          approvedBudgetCount: 0,
          source: "posted_ledger",
        },
        dataQuality: { pendingCount: 6 },
        sourceControls: {
          source: "workbook_import_review_rows",
          accountingStatus: "unconfirmed_non_canonical",
          rowCount: 1,
          byKind: [{ kind: "bonus_control", count: 1 }],
          monthly: [],
          debt: [],
          expenseCategories: [],
        },
      },
    });
    const after = (
      await pool.query(
        `select
          (select count(*)::int from journal_entries where organization_id=$1) journals,
          (select count(*)::int from commercial_documents where organization_id=$1) documents,
          (select count(*)::int from expenses where organization_id=$1) expenses,
          (select count(*)::int from reconciliation_attempts where organization_id=$1) reconciliations`,
        [org],
      )
    ).rows[0];
    expect(after).toEqual(before);
  });

  it("classifies legacy owner-current expenses as owner-paid in owner-final mode", async () => {
    await pool.query(
      `insert into accounting_workflow_policies
       (organization_id,operating_mode,allow_self_approval,soft_lock_posting_roles,updated_by)
       values($1,'solopreneur',false,'["owner","finance_admin"]',$2)
       on conflict(organization_id) do update
       set operating_mode='solopreneur',updated_by=excluded.updated_by,updated_at=now()`,
      [org, owner],
    );
    await pool.query(
      `update financial_statement_mapping_versions
       set state='draft',approved_at=null,approved_by=null
       where organization_id=$1 and id='tt133-dashboard'`,
      [org],
    );

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/organizations/${org}/reports/operating-dashboard?asOf=2026-08-06&startsOn=2026-01-01&endsOn=2026-08-06`,
      headers: { authorization: `Bearer ${token}`, "x-correlation-id": "owner-final-funding" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.financials).toMatchObject({
      actualOwnerPaidCompanyCostMinor: "100",
      unclassifiedOwnerPaidCount: 0,
      unclassifiedOwnerPaidMinor: "0",
      ownerPaidClassificationStatus: "ready",
      ownerOperatingPayableMinor: "100",
      statutoryOwnerCurrentBalanceMinor: "810",
      configurationWarnings: expect.arrayContaining([
        "financial_statement_mapping_unapproved",
        "executive_metric_policy_missing",
        "cit_policy_missing",
      ]),
    });
  });
});
