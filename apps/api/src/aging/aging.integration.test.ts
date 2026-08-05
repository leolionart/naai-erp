import { createHash } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
const suite = enabled ? describe : describe.skip;

suite("ERP-430 AR/AP aging PostgreSQL API", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const token = "erp430-token";
  let app: Awaited<ReturnType<typeof createApp>>;
  const headers = { authorization: `Bearer ${token}`, "x-correlation-id": "corr-erp430" };

  beforeAll(async () => {
    await pool.query(`
      insert into organizations(id,legal_name,base_currency,timezone) values('org-erp430','ERP 430','VND','Asia/Ho_Chi_Minh'),('org-erp430-other','Other','VND','Asia/Ho_Chi_Minh');
      insert into accounts(organization_id,code,name,root_type,is_control_account,allow_manual_posting) values
        ('org-erp430','131','AR','asset',true,false),('org-erp430','331','AP','liability',true,false),('org-erp430','511','Revenue','revenue',false,true),('org-erp430','642','Expense','expense',false,true),('org-erp430','112','Bank','asset',false,true);
      insert into parties(organization_id,id,display_name,status) values
        ('org-erp430','customer','Customer','active'),('org-erp430','supplier','Supplier','active');
      insert into party_roles(organization_id,party_id,role) values('org-erp430','customer','client'),('org-erp430','supplier','supplier');
      insert into journal_entries(organization_id,id,journal_date,description,currency,state,version,created_by,approved_at,approved_by,approval_reason,posted_at,posted_by) values
        ('org-erp430','j-ar','2026-08-01','AR invoice','VND','posted',2,'finance',now(),'finance','Approved',now(),'finance'),
        ('org-erp430','j-credit','2026-08-02','AR credit','VND','posted',2,'finance',now(),'finance','Approved',now(),'finance'),
        ('org-erp430','j-pay','2026-08-10','Receipt','VND','reversed',3,'finance',now(),'finance','Approved',now(),'finance'),
        ('org-erp430','j-pay-rev','2026-08-20','Receipt reversal','VND','posted',2,'finance',now(),'finance','Approved',now(),'finance'),
        ('org-erp430','j-ap','2026-08-03','AP invoice','VND','posted',2,'finance',now(),'finance','Approved',now(),'finance');
      update journal_entries set reversal_of_id='j-pay' where organization_id='org-erp430' and id='j-pay-rev';
      insert into journal_lines(organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions) values
        ('org-erp430','j-ar',1,'131',100,null,'AR','{}'),('org-erp430','j-ar',2,'511',null,100,'Revenue','{}'),
        ('org-erp430','j-credit',1,'511',20,null,'Credit','{}'),('org-erp430','j-credit',2,'131',null,20,'AR credit','{}'),
        ('org-erp430','j-pay',1,'112',40,null,'Bank','{}'),('org-erp430','j-pay',2,'131',null,40,'Settlement','{}'),
        ('org-erp430','j-pay-rev',1,'112',null,40,'Bank reversal','{}'),('org-erp430','j-pay-rev',2,'131',40,null,'Settlement reversal','{}'),
        ('org-erp430','j-ap',1,'642',50,null,'Expense','{}'),('org-erp430','j-ap',2,'331',null,50,'AP','{}');
      insert into commercial_documents(organization_id,id,type,state,document_number,series,fiscal_year,party_id,document_date,due_date,currency,net_minor,tax_minor,gross_minor,control_account_code,original_document_id,journal_id,created_by) values
        ('org-erp430','ar-1','sales_invoice','partially_paid','AR-1','AA',2026,'customer','2026-08-01','2026-07-31','VND',100,0,100,'131',null,'j-ar','finance'),
        ('org-erp430','credit-1','credit_note','issued','CR-1','AA',2026,'customer','2026-08-02','2026-08-02','VND',20,0,20,'131','ar-1','j-credit','finance'),
        ('org-erp430','ap-1','purchase_invoice','posted','AP-1',null,2026,'supplier','2026-08-03','2026-09-03','VND',50,0,50,'331',null,'j-ap','finance');
      insert into financial_accounts(organization_id,id,code,kind,display_name,currency,ledger_account_code,bank_code,created_by,updated_by) values('org-erp430','bank','BANK','bank','Bank','VND','112','BANK','finance','finance');
      insert into bank_transactions(organization_id,id,financial_account_id,fingerprint,booking_date,amount_minor,currency,description,state) values('org-erp430','bank-pay','bank',repeat('9',64),'2026-08-10',40,'VND','Receipt','reconciled');
      insert into payment_reconciliations(organization_id,id,bank_transaction_id,direction,statement_amount_minor,statement_currency,current_attempt_number,created_by) values('org-erp430','rec-parent','bank-pay','receipt',40,'VND',1,'finance');
      insert into reconciliation_attempts(organization_id,id,reconciliation_id,attempt_number,bank_transaction_id,state,bank_amount_minor,bank_currency,base_amount_minor,policy_version,candidate_generation,journal_id,reversal_journal_id,created_by) values('org-erp430','rec-attempt','rec-parent',1,'bank-pay','unreconciled',40,'VND',40,1,1,'j-pay','j-pay-rev','finance');
      insert into reconciliation_allocations(organization_id,id,line_number,reconciliation_id,target_type,commercial_document_id,target_amount_minor,target_currency,base_amount_minor,statement_amount_minor,target_outstanding_before_minor,control_account_code) values('org-erp430','alloc-1',1,'rec-attempt','commercial_document','ar-1',40,'VND',40,40,100,'131');
    `);
    await pool.query(
      "insert into api_credentials(organization_id,id,actor_id,token_hash,roles) values('org-erp430','cred','finance',$1,'[\"finance_admin\"]')",
      [createHash("sha256").update(token).digest("hex")],
    );
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    await app?.close();
    await pool.end();
  });

  it("uses posted settlement and reversal dates while keeping customer credits separate", async () => {
    const before = await app.inject({
      method: "GET",
      url: "/api/v1/organizations/org-erp430/reports/ar-aging?asOf=2026-08-15",
      headers,
    });
    expect(before.statusCode, before.body).toBe(200);
    expect(before.json().data).toMatchObject({
      side: "ar",
      outstandingTotalMinor: "60",
      creditOrAdvanceTotalMinor: "20",
      tieStatus: "tied",
    });
    expect(before.json().data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "doc:ar-1", outstandingMinor: "60", bucket: "1_30" }),
        expect.objectContaining({
          id: "doc:credit-1",
          balanceKind: "customer_credit",
          bucket: "unclassified",
        }),
      ]),
    );
    const after = await app.inject({
      method: "GET",
      url: "/api/v1/organizations/org-erp430/reports/ar-aging?asOf=2026-08-25",
      headers,
    });
    expect(after.statusCode, after.body).toBe(200);
    expect(after.json().data).toMatchObject({
      outstandingTotalMinor: "100",
      creditOrAdvanceTotalMinor: "20",
      tieStatus: "tied",
    });
  });

  it("returns AP separately and enforces organization-scoped party and item detail", async () => {
    const ap = await app.inject({
      method: "GET",
      url: "/api/v1/organizations/org-erp430/reports/ap-aging?asOf=2026-08-15",
      headers,
    });
    expect(ap.statusCode, ap.body).toBe(200);
    expect(ap.json().data).toMatchObject({
      side: "ap",
      outstandingTotalMinor: "50",
      tieStatus: "tied",
    });
    const party = await app.inject({
      method: "GET",
      url: "/api/v1/organizations/org-erp430/reports/ar-aging/parties/customer?asOf=2026-08-15",
      headers,
    });
    expect(party.statusCode).toBe(200);
    expect(
      party.json().data.items.every((item: { partyId: string }) => item.partyId === "customer"),
    ).toBe(true);
    const item = await app.inject({
      method: "GET",
      url: "/api/v1/organizations/org-erp430/reports/ar-aging/items/doc%3Aar-1?asOf=2026-08-15",
      headers,
    });
    expect(item.statusCode, item.body).toBe(200);
    expect(item.json().data.item.id).toBe("doc:ar-1");
    const other = await app.inject({
      method: "GET",
      url: "/api/v1/organizations/org-erp430-other/reports/ar-aging?asOf=2026-08-15",
      headers,
    });
    expect(other.statusCode).toBe(403);
  });
});
