import { createHash } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
(enabled ? describe : describe.skip)(
  "ERP-905 canonical project profitability PostgreSQL API",
  () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const org = "org-erp905-profit";
    const token = "erp905-viewer";
    let app: Awaited<ReturnType<typeof createApp>>;

    beforeAll(async () => {
      await pool.query(`
      insert into organizations(id,legal_name,base_currency,timezone) values('${org}','ERP905','VND','Asia/Ho_Chi_Minh');
      insert into users(id,email,display_name) values('owner905','owner905@example.com','Owner');
      insert into organization_memberships(organization_id,user_id) values('${org}','owner905');
      insert into membership_roles(organization_id,user_id,role) values('${org}','owner905','owner');
      insert into parties(organization_id,id,display_name) values('${org}','client905','Client'),('${org}','supplier905','Supplier');
      insert into projects(organization_id,id,code,name,client_party_id,owner_user_id,contract_type,currency,budget_minor,starts_on,state)
        values('${org}','project905','P905','Canonical costs','client905','owner905','fixed_fee','VND',100,'2026-01-01','active');
      insert into accounts(organization_id,code,name,root_type,allow_manual_posting) values
        ('${org}','111','Cash','asset',false),('${org}','331','AP','liability',false),
        ('${org}','511','Revenue','revenue',false),('${org}','621','Direct cost','expense',false);
      insert into api_credentials(organization_id,id,actor_id,token_hash,roles) values
        ('${org}','cred905','owner905','${createHash("sha256").update(token).digest("hex")}','["viewer"]');
      insert into journal_entries(organization_id,id,journal_date,description,currency,state,version,created_by,approved_at,approved_by,approval_reason,posted_at,posted_by) values
        ('${org}','j-rec905','2026-08-03','Recognition','VND','posted',2,'owner905',now(),'owner905','Approved',now(),'owner905'),
        ('${org}','j-exp905','2026-08-03','Expense','VND','posted',2,'owner905',now(),'owner905','Approved',now(),'owner905'),
        ('${org}','j-pur905','2026-08-03','Purchase','VND','posted',2,'owner905',now(),'owner905','Approved',now(),'owner905');
      insert into journal_lines(organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions) values
        ('${org}','j-rec905',1,'511',null,100,'Revenue','{"projectId":"project905"}'),
        ('${org}','j-exp905',1,'621',20,null,'Expense','{"projectId":"project905"}'),
        ('${org}','j-pur905',1,'621',30,null,'Purchase','{"projectId":"project905"}');
      insert into revenue_recognition_policies(organization_id,id,project_id,version_number,method,effective_from,currency,contract_value_minor,revenue_account_code,contract_asset_account_code,contract_liability_account_code,state,version,created_by)
        values('${org}','policy905','project905',1,'invoice','2026-01-01','VND',100,'511','111','331','approved',2,'owner905');
      insert into revenue_recognition_events(organization_id,id,project_id,policy_id,policy_version_number,effective_on,amount_minor,currency,policy_snapshot,state,version,journal_id,reason,created_by)
        values('${org}','rec905','project905','policy905',1,'2026-08-03',100,'VND','{}','posted',4,'j-rec905','Recognized','owner905');
      insert into expenses(organization_id,id,expense_class,state,payee_party_id,expense_date,business_purpose,currency,net_minor,vat_minor,gross_minor,counter_account_code,journal_id,created_by,posted_by,posted_at) values
        ('${org}','expense905','receipt_backed','posted','supplier905','2026-08-03','Direct work','VND',20,0,20,'111','j-exp905','owner905','owner905',now()),
        ('${org}','overhead905','receipt_backed','posted','supplier905','2026-08-03','Company overhead','VND',40,0,40,'111',null,'owner905','owner905',now()),
        ('${org}','draft905','receipt_backed','draft','supplier905','2026-08-03','Draft direct','VND',60,0,60,'111',null,'owner905',null,null);
      insert into expense_lines(organization_id,expense_id,line_number,description,net_minor,vat_minor,gross_minor,posting_account_code,dimensions) values
        ('${org}','expense905',1,'Direct',20,0,20,'621','{"projectId":"project905"}'),
        ('${org}','overhead905',1,'Overhead',40,0,40,'621','{}'),
        ('${org}','draft905',1,'Draft',60,0,60,'621','{"projectId":"project905"}');
      insert into commercial_documents(organization_id,id,type,state,document_number,series,fiscal_year,party_id,document_date,due_date,currency,net_minor,tax_minor,gross_minor,control_account_code,journal_id,created_by) values
        ('${org}','purchase905','purchase_invoice','posted','PUR905','PUR',2026,'supplier905','2026-08-03','2026-08-03','VND',30,0,30,'331','j-pur905','owner905'),
        ('${org}','purchase-draft905','purchase_invoice','draft','PUR906','PUR',2026,'supplier905','2026-08-03','2026-08-03','VND',70,0,70,'331',null,'owner905');
      insert into commercial_document_lines(organization_id,document_id,line_number,description,quantity,unit_price_minor,net_minor,tax_minor,gross_minor,primary_account_code,dimensions) values
        ('${org}','purchase905',1,'Vendor',1,30,30,0,30,'621','{"projectId":"project905"}'),
        ('${org}','purchase-draft905',1,'Draft vendor',1,70,70,0,70,'621','{"projectId":"project905"}');
    `);
      app = await createApp();
      await app.init();
      await app.getHttpAdapter().getInstance().ready();
    });
    afterAll(async () => {
      await app?.close();
      await pool.end();
    });

    it("includes each posted projected canonical source once and excludes drafts and overhead", async () => {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${org}/reports/project-profitability/projects/project905?startsOn=2026-08-01&endsOn=2026-08-31`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json().data).toMatchObject({
        recognizedRevenueMinor: "100",
        directCostMinor: "50",
        grossMarginMinor: "50",
        directCostBreakdown: [
          { kind: "expense", amountMinor: "20", sourceIds: ["expense905"] },
          { kind: "purchase_document", amountMinor: "30", sourceIds: ["purchase905"] },
        ],
        glTie: { sourceMinor: "50", ledgerMinor: "50", differenceMinor: "0", status: "tied_out" },
      });
      expect(response.json().data.drilldown).toMatchObject({
        expenseIds: ["expense905"],
        purchaseDocumentIds: ["purchase905"],
      });
    });
  },
);
