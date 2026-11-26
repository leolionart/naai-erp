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
      insert into journal_entries(organization_id,id,journal_date,description,currency,state,version,created_by,approved_at,approved_by,approval_reason,posted_at,posted_by,reversal_of_id) values
        ('org-erp430','j-ar','2026-08-01','AR invoice','VND','posted',2,'finance',now(),'finance','Approved',now(),'finance',null),
        ('org-erp430','j-credit','2026-08-02','AR credit','VND','posted',2,'finance',now(),'finance','Approved',now(),'finance',null),
        ('org-erp430','j-pay','2026-08-10','Receipt','VND','reversed',3,'finance',now(),'finance','Approved',now(),'finance',null),
        ('org-erp430','j-pay-rev','2026-08-20','Receipt reversal','VND','posted',2,'finance',now(),'finance','Approved',now(),'finance','j-pay'),
        ('org-erp430','j-ap','2026-08-03','AP invoice','VND','posted',2,'finance',now(),'finance','Approved',now(),'finance',null),
        ('org-erp430','j-advance','2026-08-04','Supplier advance','VND','posted',2,'finance',now(),'finance','Approved',now(),'finance',null);
      insert into journal_lines(organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions) values
        ('org-erp430','j-ar',1,'131',100,null,'AR','{}'),('org-erp430','j-ar',2,'511',null,100,'Revenue','{}'),
        ('org-erp430','j-credit',1,'511',20,null,'Credit','{}'),('org-erp430','j-credit',2,'131',null,20,'AR credit','{}'),
        ('org-erp430','j-pay',1,'112',40,null,'Bank','{}'),('org-erp430','j-pay',2,'131',null,40,'Settlement','{}'),
        ('org-erp430','j-pay-rev',1,'112',null,40,'Bank reversal','{}'),('org-erp430','j-pay-rev',2,'131',40,null,'Settlement reversal','{}'),
        ('org-erp430','j-ap',1,'642',50,null,'Expense','{}'),('org-erp430','j-ap',2,'331',null,50,'AP','{}'),
        ('org-erp430','j-advance',1,'331',7,null,'Supplier advance','{"partyId":"supplier","documentRef":"ADV-1"}'),('org-erp430','j-advance',2,'112',null,7,'Bank','{}');
      insert into opening_balance_imports(organization_id,id,journal_id,opening_date,currency,control_debit_minor,control_credit_minor,status,created_by,correlation_id)
      values('org-erp430','opening-advance','j-advance','2026-08-04','VND',7,7,'posted','finance','corr-advance');
      insert into commercial_documents(organization_id,id,type,state,document_number,series,fiscal_year,party_id,document_date,due_date,currency,net_minor,tax_minor,gross_minor,control_account_code,original_document_id,journal_id,created_by) values
        ('org-erp430','ar-1','sales_invoice','partially_paid','AR-1','AA',2026,'customer','2026-07-01','2026-07-31','VND',100,0,100,'131',null,'j-ar','finance'),
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
      creditOrAdvanceTotalMinor: "7",
      tieStatus: "tied",
    });
    expect(ap.json().data.exceptions).toEqual([]);
    expect(ap.json().data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ balanceKind: "supplier_advance", outstandingMinor: "7" }),
      ]),
    );
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

suite(
  "T-INT-AP-001 ERP-984 AP aging supplier invoices, freelance payables and owner separation",
  () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const org = "org-erp984";
    const ownerId = "erp984-owner";
    const token = "erp984-token";
    let app: Awaited<ReturnType<typeof createApp>>;
    const headers = { authorization: `Bearer ${token}`, "x-correlation-id": "corr-erp984" };

    beforeAll(async () => {
      await pool.query(`
      insert into users(id,email,display_name) values('${ownerId}','erp984@example.test','Owner 984');
      insert into organizations(id,legal_name,base_currency,timezone) values('${org}','ERP 984','VND','Asia/Ho_Chi_Minh');
      insert into organization_memberships(organization_id,user_id) values('${org}','${ownerId}');
      insert into fiscal_years(organization_id,year,starts_on,ends_on) values('${org}',2026,'2026-01-01','2026-12-31');
      insert into fiscal_periods(organization_id,fiscal_year,period_number,starts_on,ends_on,state)
        values('${org}',2026,8,'2026-08-01','2026-08-31','open');
      insert into accounts(organization_id,code,name,root_type,is_control_account,allow_manual_posting) values
        ('${org}','111','Company cash','asset',false,true),
        ('${org}','112','Company bank','asset',false,true),
        ('${org}','131','Accounts receivable','asset',true,false),
        ('${org}','1388','Owner receivable','asset',true,false),
        ('${org}','331','Accounts payable','liability',true,false),
        ('${org}','3388','Owner current payable','liability',true,false),
        ('${org}','642','Operating expense','expense',false,true);
      insert into financial_statement_mapping_versions(organization_id,id,framework,version,effective_from,state,change_reason,created_by,approved_at,approved_by)
        values('${org}','map-984','TT133',1,'2026-01-01','approved','Approved','${ownerId}',now(),'${ownerId}');
      insert into financial_statement_mapping_lines(organization_id,mapping_id,mapping_version,line_number,statement,line_code,label,account_code,display_order,sign)
        values('${org}','map-984',1,1,'balance_sheet','owner_current','Owner current','3388',10,1);
      insert into parties(organization_id,id,display_name,status) values
        ('${org}','supplier-a','Supplier Alpha','active'),
        ('${org}','freelancer-a','Freelancer Beta','active');
      insert into party_roles(organization_id,party_id,role) values
        ('${org}','supplier-a','supplier'),
        ('${org}','freelancer-a','freelancer');
      insert into projects(organization_id,id,code,name,client_party_id,owner_user_id,contract_type,currency,budget_minor,starts_on,state)
        values('${org}','project-a','PRJ-984','Project 984','supplier-a','${ownerId}','fixed_fee','VND',0,'2026-01-01','active');
      insert into financial_accounts(organization_id,id,code,kind,display_name,currency,ledger_account_code,bank_code,created_by,updated_by) values
        ('${org}','bank-a','BANK-A','bank','Company Bank','VND','112','VCB','${ownerId}','${ownerId}'),
        ('${org}','cash-a','CASH-COMPANY','cash','Company Cash','VND','111',null,'${ownerId}','${ownerId}');

      insert into journal_entries(organization_id,id,journal_date,description,currency,state,version,created_by,approved_at,approved_by,approval_reason,posted_at,posted_by) values
        ('${org}','j-pi-unpaid','2026-08-01','Unpaid supplier invoice','VND','posted',2,'${ownerId}',now(),'${ownerId}','Approved',now(),'${ownerId}'),
        ('${org}','j-pi-partial','2026-08-02','Partial supplier invoice','VND','posted',2,'${ownerId}',now(),'${ownerId}','Approved',now(),'${ownerId}'),
        ('${org}','j-pi-partial-pay','2026-08-12','Partial supplier payment','VND','posted',2,'${ownerId}',now(),'${ownerId}','Approved',now(),'${ownerId}'),
        ('${org}','j-pi-settled','2026-08-03','Settled supplier invoice','VND','posted',2,'${ownerId}',now(),'${ownerId}','Approved',now(),'${ownerId}'),
        ('${org}','j-pi-settled-pay','2026-08-18','Full supplier payment','VND','posted',2,'${ownerId}',now(),'${ownerId}','Approved',now(),'${ownerId}'),
        ('${org}','j-pi-company-bank','2026-08-04','Company bank paid invoice','VND','posted',2,'${ownerId}',now(),'${ownerId}','Approved',now(),'${ownerId}'),
        ('${org}','j-pi-company-cash','2026-08-05','Company cash paid invoice','VND','posted',2,'${ownerId}',now(),'${ownerId}','Approved',now(),'${ownerId}'),
        ('${org}','j-pi-owner-paid','2026-08-06','Owner paid invoice','VND','posted',2,'${ownerId}',now(),'${ownerId}','Approved',now(),'${ownerId}'),
        ('${org}','j-exp-owner-paid','2026-08-07','Owner paid expense','VND','posted',2,'${ownerId}',now(),'${ownerId}','Approved',now(),'${ownerId}'),
        ('${org}','j-owner-personal','2026-08-08','Owner personal spending','VND','posted',2,'${ownerId}',now(),'${ownerId}','Approved',now(),'${ownerId}'),
        ('${org}','j-freelance','2026-08-09','Freelance cost','VND','posted',2,'${ownerId}',now(),'${ownerId}','Approved',now(),'${ownerId}'),
        ('${org}','j-freelance-pay','2026-08-11','Freelance partial pay','VND','posted',2,'${ownerId}',now(),'${ownerId}','Approved',now(),'${ownerId}'),
        ('${org}','j-manual-331','2026-08-28','Unlinked manual 331 entry','VND','posted',2,'${ownerId}',now(),'${ownerId}','Approved',now(),'${ownerId}');

      insert into journal_lines(organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions) values
        ('${org}','j-pi-unpaid',1,'642',100,null,'Cost','{}'),('${org}','j-pi-unpaid',2,'331',null,100,'AP','{}'),
        ('${org}','j-pi-partial',1,'642',80,null,'Cost','{}'),('${org}','j-pi-partial',2,'331',null,80,'AP','{}'),
        ('${org}','j-pi-partial-pay',1,'331',30,null,'AP settle','{}'),('${org}','j-pi-partial-pay',2,'112',null,30,'Bank','{}'),
        ('${org}','j-pi-settled',1,'642',60,null,'Cost','{}'),('${org}','j-pi-settled',2,'331',null,60,'AP','{}'),
        ('${org}','j-pi-settled-pay',1,'331',60,null,'AP settle','{}'),('${org}','j-pi-settled-pay',2,'112',null,60,'Bank','{}'),
        ('${org}','j-pi-company-bank',1,'642',90,null,'Cost','{}'),('${org}','j-pi-company-bank',2,'112',null,90,'Bank','{}'),
        ('${org}','j-pi-company-cash',1,'642',40,null,'Cost','{}'),('${org}','j-pi-company-cash',2,'111',null,40,'Cash','{}'),
        ('${org}','j-pi-owner-paid',1,'642',70,null,'Cost','{}'),('${org}','j-pi-owner-paid',2,'3388',null,70,'Owner payable','{}'),
        ('${org}','j-exp-owner-paid',1,'642',35,null,'Cost','{}'),('${org}','j-exp-owner-paid',2,'3388',null,35,'Owner payable','{}'),
        ('${org}','j-owner-personal',1,'1388',25,null,'Owner receivable','{}'),('${org}','j-owner-personal',2,'112',null,25,'Bank','{}'),
        ('${org}','j-freelance',1,'642',120,null,'Freelance','{"projectId":"project-a"}'),('${org}','j-freelance',2,'331',null,120,'AP','{"partyId":"freelancer-a"}'),
        ('${org}','j-freelance-pay',1,'331',45,null,'Freelance pay','{}'),('${org}','j-freelance-pay',2,'112',null,45,'Bank','{}'),
        ('${org}','j-manual-331',1,'642',10,null,'Manual','{}'),('${org}','j-manual-331',2,'331',null,10,'Manual AP','{}');

      insert into commercial_documents(organization_id,id,type,state,document_number,fiscal_year,party_id,document_date,due_date,currency,net_minor,tax_minor,gross_minor,control_account_code,funding_financial_account_id,journal_id,created_by) values
        ('${org}','pi-unpaid','purchase_invoice','posted','PI-UNPAID',2026,'supplier-a','2026-08-01','2026-08-10','VND',100,0,100,'331',null,'j-pi-unpaid','${ownerId}'),
        ('${org}','pi-partial','purchase_invoice','partially_paid','PI-PARTIAL',2026,'supplier-a','2026-08-02','2026-08-25','VND',80,0,80,'331',null,'j-pi-partial','${ownerId}'),
        ('${org}','pi-settled','purchase_invoice','paid','PI-SETTLED',2026,'supplier-a','2026-08-03','2026-08-20','VND',60,0,60,'331',null,'j-pi-settled','${ownerId}'),
        ('${org}','pi-company-bank','purchase_invoice','paid','PI-BANK',2026,'supplier-a','2026-08-04','2026-08-04','VND',90,0,90,'331','bank-a','j-pi-company-bank','${ownerId}'),
        ('${org}','pi-company-cash','purchase_invoice','paid','PI-CASH',2026,'supplier-a','2026-08-05','2026-08-05','VND',40,0,40,'111','cash-a','j-pi-company-cash','${ownerId}'),
        ('${org}','pi-owner-paid','purchase_invoice','posted','PI-OWNER',2026,'supplier-a','2026-08-06','2026-09-06','VND',70,0,70,'3388',null,'j-pi-owner-paid','${ownerId}');

      insert into bank_transactions(organization_id,id,financial_account_id,fingerprint,booking_date,amount_minor,currency,description,state) values
        ('${org}','bt-partial','bank-a',repeat('a',64),'2026-08-12',-30,'VND','Partial pay','reconciled'),
        ('${org}','bt-settled','bank-a',repeat('b',64),'2026-08-18',-60,'VND','Full pay','reconciled');
      insert into payment_reconciliations(organization_id,id,bank_transaction_id,direction,statement_amount_minor,statement_currency,current_attempt_number,created_by) values
        ('${org}','pr-partial','bt-partial','payment',30,'VND',1,'${ownerId}'),
        ('${org}','pr-settled','bt-settled','payment',60,'VND',1,'${ownerId}');
      insert into reconciliation_attempts(organization_id,id,reconciliation_id,attempt_number,bank_transaction_id,state,bank_amount_minor,bank_currency,base_amount_minor,policy_version,candidate_generation,journal_id,created_by) values
        ('${org}','ra-partial','pr-partial',1,'bt-partial','reconciled',30,'VND',30,1,1,'j-pi-partial-pay','${ownerId}'),
        ('${org}','ra-settled','pr-settled',1,'bt-settled','reconciled',60,'VND',60,1,1,'j-pi-settled-pay','${ownerId}');
      insert into reconciliation_allocations(organization_id,id,line_number,reconciliation_id,target_type,commercial_document_id,target_amount_minor,target_currency,base_amount_minor,statement_amount_minor,target_outstanding_before_minor,control_account_code) values
        ('${org}','alloc-partial',1,'ra-partial','commercial_document','pi-partial',30,'VND',30,30,80,'331'),
        ('${org}','alloc-settled',1,'ra-settled','commercial_document','pi-settled',60,'VND',60,60,60,'331');

      insert into expenses(organization_id,id,expense_class,state,payee_party_id,expense_date,freelance_due_date,business_purpose,currency,net_minor,vat_minor,gross_minor,counter_account_code,cit_state,vat_state,evidence_checklist,journal_id,version,created_by,approved_by,approved_at,posted_by,posted_at) values
        ('${org}','exp-owner-paid','invoice_backed','posted','supplier-a','2026-08-07',null,'Owner paid expense','VND',35,0,35,'3388','eligible','ineligible','{}','j-exp-owner-paid',1,'${ownerId}','${ownerId}',now(),'${ownerId}',now()),
        ('${org}','exp-freelance','freelancer','posted','freelancer-a','2026-08-09','2026-08-22','Freelance work','VND',120,0,120,'331','eligible','ineligible','{}','j-freelance',1,'${ownerId}','${ownerId}',now(),'${ownerId}',now());
      insert into project_freelance_payables(organization_id,id,expense_id,project_id,freelancer_party_id,due_date,amount_minor,paid_minor,state,currency,journal_id,created_by)
        values('${org}','fp-1','exp-freelance','project-a','freelancer-a','2026-08-22',120,45,'partially_paid','VND','j-freelance','${ownerId}');
      insert into project_freelance_payable_payments(organization_id,id,payable_id,financial_account_id,payment_date,amount_minor,journal_id,created_by,correlation_id)
        values('${org}','fpp-1','fp-1','bank-a','2026-08-11',45,'j-freelance-pay','${ownerId}','corr-fpp-1');
    `);
      await pool.query(
        `insert into api_credentials(organization_id,id,actor_id,token_hash,roles) values($1,'cred-984',$2,$3,'["owner","finance_admin"]')`,
        [org, ownerId, createHash("sha256").update(token).digest("hex")],
      );
      app = await createApp();
      await app.init();
      await app.getHttpAdapter().getInstance().ready();
    });

    afterAll(async () => {
      await app?.close();
      await pool.end();
    });

    it("includes unpaid supplier invoices and freelance payables, excludes owner-paid/company-paid/1388, and ties to 331", async () => {
      // Before 2026-08-18 settlement of pi-settled: 100 + (80-30) + 60 + (120-45) = 285
      const beforeFullPay = await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${org}/reports/ap-aging?asOf=2026-08-15`,
        headers,
      });
      expect(beforeFullPay.statusCode, beforeFullPay.body).toBe(200);
      expect(beforeFullPay.json().data).toMatchObject({
        side: "ap",
        outstandingTotalMinor: "285",
        tieStatus: "tied",
        exceptions: [],
      });
      expect(beforeFullPay.json().data.items.map((item: { id: string }) => item.id)).toEqual([
        "doc:pi-unpaid",
        "doc:pi-settled",
        "freelance:fp-1",
        "doc:pi-partial",
      ]);

      // After 2026-08-18 settlement of pi-settled: 100 + 50 + 75 = 225; company_* and owner_paid never appear
      const afterFullPay = await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${org}/reports/ap-aging?asOf=2026-08-25`,
        headers,
      });
      expect(afterFullPay.statusCode, afterFullPay.body).toBe(200);
      const apData = afterFullPay.json().data;
      expect(apData).toMatchObject({
        side: "ap",
        outstandingTotalMinor: "225",
        baseOutstandingTotalMinor: "225",
        tieStatus: "tied",
        exceptions: [],
        controlTies: [
          expect.objectContaining({
            controlAccountCode: "331",
            currency: "VND",
            subledgerBalanceMinor: "225",
            ledgerBalanceMinor: "225",
            differenceMinor: "0",
            status: "tied",
          }),
        ],
      });
      expect(apData.items).toEqual([
        expect.objectContaining({
          id: "doc:pi-unpaid",
          controlAccountCode: "331",
          paymentStatus: "unpaid",
          outstandingMinor: "100",
          bucket: "1_30",
          drilldown: expect.objectContaining({
            sourceType: "commercial_document",
            sourceId: "pi-unpaid",
          }),
        }),
        expect.objectContaining({
          id: "freelance:fp-1",
          controlAccountCode: "331",
          paymentStatus: "partially_paid",
          originalMinor: "120",
          settledMinor: "45",
          outstandingMinor: "75",
          bucket: "1_30",
          drilldown: expect.objectContaining({
            sourceType: "project_freelance_payable",
            sourceId: "fp-1",
          }),
        }),
        expect.objectContaining({
          id: "doc:pi-partial",
          controlAccountCode: "331",
          paymentStatus: "partially_paid",
          originalMinor: "80",
          settledMinor: "30",
          outstandingMinor: "50",
          bucket: "current",
        }),
      ]);

      // With includeSettled=true: settled 331 invoice appears with 0 balance, while company_* and owner_paid still never appear
      const withSettled = await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${org}/reports/ap-aging?asOf=2026-08-25&includeSettled=true`,
        headers,
      });
      expect(withSettled.statusCode, withSettled.body).toBe(200);
      const settledIds = withSettled.json().data.items.map((item: { id: string }) => item.id);
      expect(settledIds).toContain("doc:pi-settled");
      expect(settledIds).not.toContain("doc:pi-owner-paid");
      expect(settledIds).not.toContain("doc:pi-company-bank");
      expect(settledIds).not.toContain("doc:pi-company-cash");
      expect(
        withSettled
          .json()
          .data.controlTies.map((tie: { controlAccountCode: string }) => tie.controlAccountCode),
      ).toEqual(["331"]);

      // AR aging also never mixes owner receivable 1388 even when 1388 has is_control_account=true
      const arAging = await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${org}/reports/ar-aging?asOf=2026-08-25`,
        headers,
      });
      expect(arAging.statusCode, arAging.body).toBe(200);
      expect(arAging.json().data).toMatchObject({
        side: "ar",
        outstandingTotalMinor: "0",
        tieStatus: "tied",
        items: [],
        controlTies: [],
      });

      // Owner positions (3388 = 105 credit, 1388 = 25 debit) remain intact in the ledger and owner-current read model
      const ownerCurrent = await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${org}/banking/owner-current-movements`,
        headers,
      });
      expect(ownerCurrent.statusCode, ownerCurrent.body).toBe(200);
      expect(ownerCurrent.json().data.summary.statutoryOwnerCurrentBalanceMinor).toBe("105");
      const ownerReceivable = await pool.query<{ balance: string }>(
        `select sum(coalesce(debit_minor,0)-coalesce(credit_minor,0))::text balance
       from journal_lines where organization_id=$1 and account_code='1388'`,
        [org],
      );
      expect(ownerReceivable.rows[0]?.balance).toBe("25");

      // Unlinked manual posting to 331 on 2026-08-28 surfaces out_of_balance cleanly
      const outOfBalance = await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${org}/reports/ap-aging?asOf=2026-08-30`,
        headers,
      });
      expect(outOfBalance.statusCode, outOfBalance.body).toBe(200);
      expect(outOfBalance.json().data).toMatchObject({
        tieStatus: "out_of_balance",
        exceptions: [
          expect.objectContaining({
            code: "CONTROL_ACCOUNT_OUT_OF_BALANCE",
            controlAccountCode: "331",
          }),
        ],
      });
    });
  },
);
