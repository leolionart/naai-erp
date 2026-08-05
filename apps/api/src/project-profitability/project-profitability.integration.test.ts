import { createHash } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;

(enabled ? describe : describe.skip)("ERP-540 project profitability PostgreSQL API", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const org = "org-erp540";
  const token = "erp540-viewer";
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeAll(async () => {
    await pool.query(`
      insert into organizations(id,legal_name,base_currency,timezone) values
        ('${org}','ERP540','VND','Asia/Ho_Chi_Minh'),
        ('org-erp540-other','Other','VND','Asia/Ho_Chi_Minh');
      insert into users(id,email,display_name) values
        ('owner540','owner540@example.com','Account Owner'),
        ('worker540','worker540@example.com','Worker');
      insert into organization_memberships(organization_id,user_id) values
        ('${org}','owner540'),('${org}','worker540'),('org-erp540-other','owner540');
      insert into membership_roles(organization_id,user_id,role) values
        ('${org}','owner540','owner'),('${org}','worker540','viewer'),('org-erp540-other','owner540','owner');
      insert into parties(organization_id,id,display_name) values
        ('${org}','client540','Client 540'),('${org}','worker-party540','Worker 540'),
        ('org-erp540-other','client-other','Other client');
      insert into projects(organization_id,id,code,name,client_party_id,owner_user_id,contract_type,currency,budget_minor,starts_on,state) values
        ('${org}','project540','P540','Profitable project','client540','owner540','fixed_fee','VND',100,'2026-01-01','active'),
        ('org-erp540-other','project-other','OTHER','Other project','client-other','owner540','fixed_fee','VND',100,'2026-01-01','active');
      insert into accounts(organization_id,code,name,root_type,allow_manual_posting) values
        ('${org}','131','AR','asset',false),('${org}','154','Contract asset','asset',false),
        ('${org}','3387','Contract liability','liability',false),('${org}','511','Revenue','revenue',false),
        ('${org}','621','Direct expense','expense',false),('${org}','642','Overhead','expense',false);
      insert into api_credentials(organization_id,id,actor_id,token_hash,roles) values
        ('${org}','cred540','owner540','${createHash("sha256").update(token).digest("hex")}', '["viewer"]');

      insert into journal_entries(organization_id,id,journal_date,description,currency,state,version,created_by,approved_at,approved_by,approval_reason,posted_at,posted_by) values
        ('${org}','j-rec540','2026-08-03','Recognition','VND','posted',2,'owner540',now(),'owner540','Approved',now(),'owner540'),
        ('${org}','j-cost540','2026-08-03','Direct cost','VND','posted',2,'owner540',now(),'owner540','Approved',now(),'owner540'),
        ('${org}','j-var540','2026-08-03','Variable overhead','VND','posted',2,'owner540',now(),'owner540','Approved',now(),'owner540'),
        ('${org}','j-fixed540','2026-08-03','Fixed overhead','VND','posted',2,'owner540',now(),'owner540','Approved',now(),'owner540');
      insert into journal_lines(organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions) values
        ('${org}','j-rec540',1,'511',null,100,'Revenue','{"projectId":"project540"}'),
        ('${org}','j-cost540',1,'621',20,null,'Direct','{"projectId":"project540"}'),
        ('${org}','j-var540',1,'642',5,null,'Variable','{"projectId":"project540"}'),
        ('${org}','j-fixed540',1,'642',7,null,'Fixed','{"projectId":"project540"}');

      insert into revenue_recognition_policies(organization_id,id,project_id,version_number,method,effective_from,currency,contract_value_minor,revenue_account_code,contract_asset_account_code,contract_liability_account_code,state,version,created_by) values
        ('${org}','policy-rec540','project540',1,'invoice','2026-01-01','VND',100,'511','154','3387','approved',2,'owner540');
      insert into revenue_recognition_events(organization_id,id,project_id,policy_id,policy_version_number,effective_on,amount_minor,currency,policy_snapshot,state,version,journal_id,reason,created_by) values
        ('${org}','rec540','project540','policy-rec540',1,'2026-08-03',100,'VND','{}','posted',4,'j-rec540','Recognized','owner540');

      insert into project_cost_items(organization_id,id,source_type,source_id,project_id,cost_class,basis,effective_on,ledger_account_code,amount_minor,base_amount_minor,currency,journal_id,description,created_by) values
        ('${org}','cost540','journal_line','j-cost540:1','project540','direct','ledger','2026-08-03','621',20,20,'VND','j-cost540','Direct','owner540'),
        ('${org}','pool-var-item540','expense','pool-var-source540',null,'overhead_reserved','management','2026-08-03','642',5,5,'VND',null,'Variable source','owner540'),
        ('${org}','pool-fixed-item540','expense','pool-fixed-source540',null,'overhead_reserved','management','2026-08-03','642',7,7,'VND',null,'Fixed source','owner540');

      insert into workforce_profiles(organization_id,id,party_id,user_id,kind,starts_on,active,version,created_by,updated_by) values
        ('${org}','worker-profile540','worker-party540','worker540','employee','2026-01-01',true,1,'owner540','owner540');
      insert into labor_cost_rates(organization_id,id,worker_id,basis,hourly_rate_minor,currency,effective_from,state,version,approved_by,approved_at,approval_reason,created_by) values
        ('${org}','rate540','worker-profile540','fully_loaded',10,'VND','2026-01-01','approved',2,'owner540',now(),'Approved','owner540');
      insert into timesheets(organization_id,id,worker_id,week_starts_on,state,version,approved_by,approved_at,created_by) values
        ('${org}','timesheet540','worker-profile540','2026-08-03','approved',3,'owner540',now(),'worker540');
      insert into timesheet_entries(organization_id,id,timesheet_id,work_date,mode,scope,project_id,service_line_code,minutes,billable,description,started_at,ended_at,created_by) values
        ('${org}','entry540','timesheet540','2026-08-03','timed','project','project540','web-app',90,true,'Build','2026-08-03T01:00:00Z','2026-08-03T02:30:00Z','worker540');
      insert into timesheet_cost_snapshots(organization_id,entry_id,rate_id,applied_hourly_rate_minor,applied_cost_minor,currency,applied_by) values
        ('${org}','entry540','rate540',10,10,'VND','owner540');
      insert into workforce_capacity_versions(organization_id,id,worker_id,weekly_minutes,workdays,effective_from,version,reason,created_by) values
        ('${org}','capacity540','worker-profile540',2400,'[1,2,3,4,5]','2026-01-01',1,'Standard capacity','owner540');

      insert into project_budget_versions(organization_id,id,project_id,version_number,kind,currency,effective_on,state,revenue_total_minor,direct_cost_total_minor,overhead_total_minor,version,approved_by,approved_at,created_by) values
        ('${org}','budget540','project540',1,'baseline','VND','2026-08-01','approved',100,30,5,2,'owner540',now(),'owner540');

      insert into commercial_documents(organization_id,id,type,state,document_number,series,fiscal_year,party_id,document_date,due_date,currency,net_minor,tax_minor,gross_minor,control_account_code,created_by) values
        ('${org}','invoice540','sales_invoice','issued','INV540','AA',2026,'client540','2026-08-01','2026-08-02','VND',80,0,80,'131','owner540');
      insert into commercial_document_lines(organization_id,document_id,line_number,description,quantity,unit_price_minor,net_minor,tax_minor,gross_minor,primary_account_code,dimensions) values
        ('${org}','invoice540',1,'Project billing',1,80,80,0,80,'511','{"projectId":"project540"}');

      insert into overhead_allocation_policies(organization_id,id,policy_code,version_number,name,method,cost_class,effective_from,state,version,created_by) values
        ('${org}','policy-var540','VAR',1,'Variable','manual','variable','2026-01-01','approved',3,'owner540'),
        ('${org}','policy-fixed540','FIX',1,'Fixed','manual','fixed','2026-01-01','approved',3,'owner540');
      insert into overhead_source_pools(organization_id,id,policy_id,policy_version_number,period_start,period_end,currency,source_amount_minor,source_base_amount_minor,state,version,reason,created_by) values
        ('${org}','pool-var540','policy-var540',1,'2026-08-03','2026-08-03','VND',5,5,'allocated',2,'Variable','owner540'),
        ('${org}','pool-fixed540','policy-fixed540',1,'2026-08-03','2026-08-03','VND',7,7,'allocated',2,'Fixed','owner540');
      insert into overhead_allocation_runs(organization_id,id,pool_id,policy_id,policy_version_number,method,period_start,period_end,currency,allocatable_amount_minor,basis_snapshot,policy_snapshot,state,version,journal_id,reason,created_by) values
        ('${org}','run-var540','pool-var540','policy-var540',1,'manual','2026-08-03','2026-08-03','VND',5,'{}','{}','posted',4,'j-var540','Variable','owner540'),
        ('${org}','run-fixed540','pool-fixed540','policy-fixed540',1,'manual','2026-08-03','2026-08-03','VND',7,'{}','{}','posted',4,'j-fixed540','Fixed','owner540');
      insert into overhead_allocation_splits(organization_id,run_id,project_id,basis_value,basis_total,amount_minor,rounding_rank) values
        ('${org}','run-var540','project540',1,1,5,1),('${org}','run-fixed540','project540',1,1,7,1);
    `);
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
    await pool.end();
  });

  it("ties posted sources, includes approved labor, and preserves organization scope", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/organizations/${org}/reports/project-profitability?startsOn=2026-08-01&endsOn=2026-08-03&groupBy=client`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode, response.body).toBe(200);
    const data = response.json().data;
    expect(data.items).toHaveLength(1);
    expect(data.items[0]).toMatchObject({
      projectId: "project540",
      recognizedRevenueMinor: "100",
      invoicedRevenueMinor: "80",
      directCostMinor: "30",
      variableOverheadMinor: "5",
      fixedOverheadMinor: "7",
      grossMarginMinor: "70",
      contributionMarginMinor: "65",
      fullyLoadedProfitMinor: "58",
      budgetCostMinor: "35",
      overrunMinor: "7",
      unbilledWorkMinor: "20",
      overdueArMinor: "80",
      billableMinutes: 90,
      projectMinutes: 90,
      availableMinutes: 480,
      utilizationBps: 1875,
      confidenceCodes: ["unbilled_work", "overdue_ar", "budget_overrun"],
    });
    expect(data.groups).toEqual([
      expect.objectContaining({ key: "client540", recognizedRevenueMinor: "100" }),
    ]);
  });

  it("returns source breakdown and honest partial GL coverage", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/organizations/${org}/reports/project-profitability/projects/project540?startsOn=2026-08-01&endsOn=2026-08-03`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toMatchObject({
      glTie: {
        recognizedRevenue: { status: "tied_out", differenceMinor: "0" },
        directProjectCost: {
          status: "difference",
          coverage: "partial",
          nonGlManagementCostMinor: "10",
        },
        allocatedOverhead: { status: "tied_out", differenceMinor: "0" },
      },
    });
  });
});
