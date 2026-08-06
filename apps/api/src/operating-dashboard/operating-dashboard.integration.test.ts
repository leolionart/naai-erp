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
        values('${org}','invoice','sales_invoice','issued','OPS-1','OPS',2026,'client','2026-07-01','2026-07-31','VND',1000,0,1000,'131','sales-journal','${owner}');
      insert into commercial_document_lines(organization_id,document_id,line_number,description,quantity,unit_price_minor,net_minor,tax_minor,gross_minor,primary_account_code,dimensions)
        values('${org}','invoice',1,'Service',1,1000,1000,0,1000,'511','{"projectId":"project"}');
      insert into commercial_document_allocations(organization_id,document_id,line_number,allocation_number,amount_minor,dimensions)
        values('${org}','invoice',1,1,1000,'{"projectId":"project"}');
      insert into workbook_import_review_rows(organization_id,id,import_identity,source_identity,workbook,sheet,source_row,kind,proposed_resource_type,status,review_flags,raw_data,mapped_data,created_by,updated_by)
        values('${org}','review','import','source','source.xlsx','Sheet1',2,'sales','commercial_document','pending_review','["missing_project"]','{}','{}','${owner}','${owner}');
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
        dataQuality: { pendingCount: 1 },
      },
    });
  });
});
import { createHash } from "node:crypto";
import pg from "pg";
