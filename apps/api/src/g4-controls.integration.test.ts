import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL,
  suite = enabled ? describe : describe.skip;
suite("Gate G4 consolidated financial controls", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  beforeAll(async () => {
    await pool.query(
      `insert into organizations(id,legal_name,base_currency,timezone)values('org-g4','G4','VND','Asia/Ho_Chi_Minh'),('org-g4-other','Other','VND','Asia/Ho_Chi_Minh');insert into accounts(organization_id,code,name,root_type,is_control_account)values('org-g4','112A','Bank A','asset',false),('org-g4','112B','Bank B','asset',false),('org-g4','113','Transit','asset',false),('org-g4','131','AR','asset',true),('org-g4','331','AP','liability',true),('org-g4','511','Revenue','revenue',false),('org-g4','642','Expense','expense',false);insert into parties(organization_id,id,display_name,status)values('org-g4','client','Client','active'),('org-g4','supplier','Supplier','active');insert into financial_accounts(organization_id,id,code,kind,display_name,currency,ledger_account_code,bank_code,created_by,updated_by)values('org-g4','fa','A','bank','A','VND','112A','A','finance','finance'),('org-g4','fb','B','bank','B','VND','112B','B','finance','finance');insert into bank_statement_imports(organization_id,id,financial_account_id,adapter_id,adapter_version,source_filename,content_sha256,row_count,imported_count,duplicate_count,rejected_count,created_by,correlation_id)values('org-g4','imp','fa','generic-csv',1,'g4.csv',repeat('1',64),1,1,0,0,'finance','corr');insert into bank_transactions(organization_id,id,financial_account_id,fingerprint,booking_date,amount_minor,currency,description,state)values('org-g4','receipt','fa',repeat('2',64),'2026-08-10',100,'VND','Receipt','reconciled'),('org-g4','transfer-out','fa',repeat('3',64),'2026-08-11',-50,'VND','Transfer','reconciled'),('org-g4','transfer-in','fb',repeat('4',64),'2026-08-11',50,'VND','Transfer','reconciled');insert into bank_statement_import_rows(organization_id,import_id,row_number,raw_payload,raw_sha256,outcome,error_codes,transaction_id)values('org-g4','imp',1,'{}',repeat('5',64),'imported','[]','receipt');insert into journal_entries(organization_id,id,journal_date,description,currency,state,version,created_by,posted_at,posted_by)values('org-g4','j-bank','2026-08-10','Receipt','VND','posted',2,'finance',now(),'finance'),('org-g4','j-transfer','2026-08-11','Transfer','VND','posted',2,'finance',now(),'finance'),('org-g4','j-ar','2026-08-01','AR','VND','posted',2,'finance',now(),'finance'),('org-g4','j-ap','2026-08-02','AP','VND','posted',2,'finance',now(),'finance');insert into journal_lines(organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions)values('org-g4','j-bank',1,'112A',100,null,'Bank','{}'),('org-g4','j-bank',2,'131',null,100,'AR settle','{}'),('org-g4','j-transfer',1,'112B',50,null,'Bank B','{}'),('org-g4','j-transfer',2,'112A',null,50,'Bank A','{}'),('org-g4','j-ar',1,'131',100,null,'AR','{}'),('org-g4','j-ar',2,'511',null,100,'Revenue','{}'),('org-g4','j-ap',1,'642',70,null,'Expense','{}'),('org-g4','j-ap',2,'331',null,70,'AP','{}');insert into bank_statement_sessions(organization_id,id,financial_account_id,period_start,period_end,opening_balance_minor,closing_balance_minor,currency,state,version,created_by,reviewed_by,reviewed_at,review_reason,closed_by,closed_at,close_reason,correlation_id)values('org-g4','session','fa','2026-08-01','2026-08-31',0,100,'VND','closed',3,'finance','finance',now(),'Reviewed','finance',now(),'Closed','corr');insert into bank_statement_session_imports(organization_id,session_id,import_id)values('org-g4','session','imp');insert into internal_transfers(organization_id,id,state,currency,transfer_amount_minor,base_principal_amount_minor,transit_account_code,current_attempt_number,created_by)values('org-g4','transfer','reconciled','VND',50,50,'113',1,'finance');insert into internal_transfer_attempts(organization_id,id,transfer_id,attempt_number,state,posting_mode,outgoing_transaction_id,incoming_transaction_id,outgoing_journal_id,manual_override_reason,matched_by,matched_at,correlation_id,created_by)values('org-g4','transfer-attempt','transfer',1,'reconciled','direct','transfer-out','transfer-in','j-transfer','Matched','finance',now(),'corr','finance');insert into commercial_documents(organization_id,id,type,state,document_number,series,fiscal_year,party_id,document_date,due_date,currency,net_minor,tax_minor,gross_minor,control_account_code,journal_id,created_by)values('org-g4','ar','sales_invoice','issued','AR','A',2026,'client','2026-08-01','2026-08-31','VND',100,0,100,'131','j-ar','finance'),('org-g4','ap','purchase_invoice','posted','AP',null,2026,'supplier','2026-08-02','2026-09-02','VND',70,0,70,'331','j-ap','finance');`,
    );
  });
  afterAll(async () => pool.end());
  it("ties banking reconciliation transfer and AR AP controls with zero suspense", async () => {
    const statement = await pool.query(
      `select s.opening_balance_minor+sum(distinct t.amount_minor) movement,s.closing_balance_minor from bank_statement_sessions s join bank_statement_session_imports x on x.organization_id=s.organization_id and x.session_id=s.id join bank_statement_import_rows r on r.organization_id=x.organization_id and r.import_id=x.import_id join bank_transactions t on t.organization_id=r.organization_id and t.id=r.transaction_id where s.organization_id='org-g4'and s.id='session'group by s.opening_balance_minor,s.closing_balance_minor`,
    );
    expect(String(statement.rows[0].movement)).toBe(
      String(statement.rows[0].closing_balance_minor),
    );
    const transfer = await pool.query(
      `select coalesce(sum(case when account_code='113'then coalesce(debit_minor,0)-coalesce(credit_minor,0)else 0 end),0)::text transit,coalesce(sum(case when account_code in('511','642')then coalesce(debit_minor,0)-coalesce(credit_minor,0)else 0 end),0)::text pnl from journal_lines where organization_id='org-g4'and journal_id='j-transfer'`,
    );
    expect(transfer.rows[0]).toMatchObject({ transit: "0", pnl: "0" });
    const controls = await pool.query(
      `select account_code,(sum(coalesce(debit_minor,0))-sum(coalesce(credit_minor,0)))::text balance from journal_lines where organization_id='org-g4'and account_code in('131','331')group by account_code order by account_code`,
    );
    expect(controls.rows).toEqual([
      { account_code: "131", balance: "0" },
      { account_code: "331", balance: "-70" },
    ]);
    const suspense = await pool.query(
      "select count(*)::int count from reconciliation_adjustments where organization_id='org-g4'and kind='suspense'",
    );
    expect(suspense.rows[0].count).toBe(0);
    const foreign = await pool.query(
      "select count(*)::int count from bank_statement_sessions where organization_id='org-g4-other'",
    );
    expect(foreign.rows[0].count).toBe(0);
  });
});
