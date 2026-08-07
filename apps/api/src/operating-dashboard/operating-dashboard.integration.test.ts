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
        ('${org}','131','Receivables','asset',true,false),('${org}','511','Revenue','revenue',false,true);
      insert into parties(organization_id,id,display_name,status) values('${org}','client','Client','active');
      insert into projects(organization_id,id,code,name,client_party_id,owner_user_id,contract_type,currency,budget_minor,starts_on,state)
        values('${org}','project','OPS','Project','client','${owner}','fixed_fee','VND',2000,'2026-01-01','active');
      insert into contracts(organization_id,id,project_id,reference,signed_on,value_minor,currency)
        values('${org}','contract','project','OPS-C','2026-01-01',2000,'VND');
      insert into journal_entries(organization_id,id,journal_date,description,currency,state,version,created_by,approved_at,approved_by,approval_reason,posted_at,posted_by)
        values('${org}','sales-journal','2026-07-01','Invoice','VND','posted',2,'${owner}',now(),'${owner}','fixture',now(),'${owner}');
      insert into journal_lines(organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions) values
        ('${org}','sales-journal',1,'131',1000,null,'AR','{}'),('${org}','sales-journal',2,'511',null,1000,'Revenue','{}');
      insert into commercial_documents(organization_id,id,type,state,document_number,series,fiscal_year,party_id,document_date,due_date,currency,net_minor,tax_minor,gross_minor,control_account_code,journal_id,created_by)
        values('${org}','invoice','sales_invoice','issued','OPS-1','OPS',2026,'client','2026-07-01','2026-07-31','VND',1000,0,1000,'131','sales-journal','${owner}'),
        ('${org}','future-invoice','sales_invoice','issued','OPS-2','OPS',2026,'client','2026-10-01','2026-10-31','VND',700,0,700,'131',null,'${owner}');
      insert into commercial_document_lines(organization_id,document_id,line_number,description,quantity,unit_price_minor,net_minor,tax_minor,gross_minor,primary_account_code,dimensions)
        values('${org}','invoice',1,'Service',1,1000,1000,0,1000,'511','{"projectId":"project"}'),
        ('${org}','future-invoice',1,'Future service',1,700,700,0,700,'511','{"projectId":"project"}');
      insert into commercial_document_allocations(organization_id,document_id,line_number,allocation_number,amount_minor,dimensions)
        values('${org}','invoice',1,1,1000,'{"projectId":"project"}'),
        ('${org}','future-invoice',1,1,700,'{"projectId":"project"}');
      insert into workbook_import_review_rows(organization_id,id,import_identity,source_identity,workbook,sheet,source_row,kind,proposed_resource_type,status,review_flags,raw_data,mapped_data,created_by,updated_by)
        values
        ('${org}','review','import','source','source.xlsx','Sheet1',2,'sales','commercial_document','pending_review','["missing_project"]','{}','{}','${owner}','${owner}'),
        ('${org}','control-profit','import','control-profit','finance','Tỷ suất lợi nhuận',2,'profitability_control','profitability_control','pending_review','["control_only"]','{}','{"sourceControl":{"workbook":"finance","sheet":"Tỷ suất lợi nhuận","row":2},"period":"2025-01","revenueMinor":"1000","receivedMinor":"900","expenseMinor":"400","profitMinor":"600"}','${owner}','${owner}'),
        ('${org}','control-plan','import','control-plan','finance','Planing & Target',2,'planning_control','planning_control','pending_review','["control_only"]','{}','{"sourceControl":{"workbook":"finance","sheet":"Planing & Target","row":2},"period":"2025-01","revenueMinor":"1000","receivedMinor":"900","expenseMinor":"450","profitMinor":"550","targetAttainmentBps":4000,"forecastExpenseMinor":"500","forecastCashMinor":"400"}','${owner}','${owner}'),
        ('${org}','control-debt','import','control-debt','finance','Công nợ',2,'debt_control','ar_control','pending_review','["control_only"]','{}','{"sourceControl":{"workbook":"finance","sheet":"Công nợ","row":2},"period":"2025-01","projectLabel":"Project","debtMinor":"100","projectCostMinor":"2000","collectedMinor":"1900"}','${owner}','${owner}'),
        ('${org}','control-bonus','import','control-bonus','finance','Tỉ lệ thưởng',2,'bonus_control','bonus_control','pending_review','["control_only"]','{}','{"sourceControl":{"workbook":"finance","sheet":"Tỉ lệ thưởng","row":2},"period":"2025-01","personName":"Owner","bonusMinor":"50","revenueMinor":"1000"}','${owner}','${owner}'),
        ('${org}','control-payroll','import','control-payroll','finance','Bảng lương',2,'payroll_master','workforce_profile_pending','pending_review','["control_only"]','{}','{"sourceControl":{"workbook":"finance","sheet":"Bảng lương","row":2},"personName":"Owner","payrollNetMinor":"300","employmentStatus":"Active","department":"Ops"}','${owner}','${owner}'),
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
    await app.close();
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
        backlog: { contractedMinor: "2000", invoicedMinor: "1000", remainingMinor: "1000" },
        collections: { receivablesMinor: "1000", overdueMinor: "1000" },
        clientConcentration: { totalRevenueMinor: "1000", topClientShareBps: 10000 },
        financials: {
          revenueMinor: "1000",
          expenseMinor: "0",
          netProfitMinor: "1000",
          unrestrictedCashMinor: null,
          rosBps: 10000,
          recognitionEventCount: 0,
          approvedBudgetCount: 0,
          postedOverheadRunCount: 0,
          source: "posted_ledger",
        },
        dataQuality: { pendingCount: 7 },
        sourceControls: {
          source: "workbook_import_review_rows",
          accountingStatus: "unconfirmed_non_canonical",
          rowCount: 2,
          byKind: [
            { kind: "bonus_control", count: 1 },
            { kind: "payroll_master", count: 1 },
          ],
          monthly: [],
          debt: [],
          expenseCategories: [],
          workforce: {
            payrollNetMinor: "300",
            bonusMinor: "50",
            payrollRowCount: 1,
            bonusRowCount: 1,
          },
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
});
