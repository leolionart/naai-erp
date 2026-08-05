import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;
const pool = databaseUrl ? new pg.Pool({ connectionString: databaseUrl }) : undefined;

describeDatabase("ERP-100 database tenant constraints", () => {
  beforeAll(async () => {
    await pool!.query(`
      insert into organizations (id, legal_name, base_currency, timezone)
      values ('org-a', 'Organization A', 'VND', 'Asia/Ho_Chi_Minh'),
             ('org-b', 'Organization B', 'VND', 'Asia/Ho_Chi_Minh');
      insert into users (id, email, display_name)
      values ('user-a', 'a@example.test', 'User A');
      insert into organization_memberships (organization_id, user_id)
      values ('org-a', 'user-a');
      insert into membership_roles (organization_id, user_id, role)
      values ('org-a', 'user-a', 'owner');
      insert into fiscal_years (organization_id, year, starts_on, ends_on)
      values ('org-a', 2026, '2026-01-01', '2026-12-31');
      insert into fiscal_periods
        (organization_id,fiscal_year,period_number,starts_on,ends_on)
      values ('org-a',2026,8,'2026-08-01','2026-08-31');
    `);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("rejects a role whose composite membership belongs to another organization", async () => {
    await expect(
      pool!.query(
        "insert into membership_roles (organization_id, user_id, role) values ($1, $2, $3)",
        ["org-b", "user-a", "viewer"],
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("rejects a fiscal period attached to another organization's fiscal year", async () => {
    await expect(
      pool!.query(
        `insert into fiscal_periods
         (organization_id, fiscal_year, period_number, starts_on, ends_on)
         values ('org-b', 2026, 1, '2026-01-01', '2026-01-31')`,
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("round-trips exchange rates as exact decimal strings", async () => {
    const result = await pool!.query<{ rate: string }>(`
      insert into exchange_rates
        (id, organization_id, source_currency, target_currency, rate, source, observed_at)
      values
        ('rate-1', 'org-a', 'USD', 'VND', 26125.500000000000000000, 'manual', '2026-08-05T02:00:00Z')
      returning rate
    `);
    expect(result.rows[0]?.rate).toBe("26125.500000000000000000");
  });

  it("enforces same-organization and same-root account hierarchy", async () => {
    await pool!.query(`
      insert into accounts (organization_id, code, name, root_type)
      values ('org-a', '111', 'Cash', 'asset'),
             ('org-a', '1111', 'Bank', 'asset'),
             ('org-a', '511', 'Revenue', 'revenue'),
             ('org-b', '111', 'Other cash', 'asset');
      insert into account_hierarchy_edges
        (organization_id, child_code, child_root_type, parent_code, parent_root_type)
      values ('org-a', '1111', 'asset', '111', 'asset');
    `);
    await expect(
      pool!.query(`
        insert into account_hierarchy_edges
          (organization_id, child_code, child_root_type, parent_code, parent_root_type)
        values ('org-b', '1111', 'asset', '111', 'asset')
      `),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      pool!.query(`
        insert into account_hierarchy_edges
          (organization_id, child_code, child_root_type, parent_code, parent_root_type)
        values ('org-a', '1111', 'asset', '511', 'revenue')
      `),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("rejects cross-organization mappings and incomplete tax approval", async () => {
    await expect(
      pool!.query(`
        insert into statutory_account_mappings
          (organization_id, account_code, framework, statutory_code, effective_from)
        values ('org-b', '511', 'TT133', '5111', '2026-01-01')
      `),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      pool!.query(`
        insert into tax_code_versions
          (organization_id, code, name, kind, rate, effective_from, review_state)
        values ('org-a', 'VAT-IN-10', 'VAT input 10%', 'vat_input', 10, '2026-01-01', 'accountant_approved')
      `),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("enforces organization ownership for dimensions and versioned defaults", async () => {
    await pool!.query(`
      insert into dimension_values (organization_id, kind, code, name)
      values ('org-a', 'category', 'HOSTING', 'Hosting'),
             ('org-a', 'cost_center', 'OPS', 'Operations');
      insert into tax_code_versions
        (organization_id, code, name, kind, rate, effective_from)
      values ('org-a', 'VAT-IN-10', 'VAT input 10%', 'vat_input', 10, '2026-01-01');
      insert into dimension_requirement_versions
        (organization_id, account_code, required_kinds, effective_from, change_reason, correlation_id, created_by)
      values ('org-a', '511', '["client", "project", "service_line"]', '2026-01-01', 'Initial rule', 'corr-120-1', 'user-a');
      insert into default_mapping_versions
        (organization_id, category_code, account_code, tax_code, tax_effective_from, default_cost_center_code,
         effective_from, change_reason, correlation_id, created_by)
      values ('org-a', 'HOSTING', '511', 'VAT-IN-10', '2026-01-01', 'OPS',
              '2026-01-01', 'Initial mapping', 'corr-120-2', 'user-a');
    `);
    await expect(
      pool!.query(`
        insert into dimension_requirement_versions
          (organization_id, account_code, required_kinds, effective_from, change_reason, correlation_id, created_by)
        values ('org-b', '511', '[]', '2026-01-01', 'Invalid', 'corr-120-x', 'user-a')
      `),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      pool!.query(`
        insert into default_mapping_versions
          (organization_id, category_code, account_code, tax_code, tax_effective_from,
           effective_from, change_reason, correlation_id, created_by)
        values ('org-b', 'HOSTING', '111', 'VAT-IN-10', '2026-01-01',
                '2026-01-01', 'Invalid', 'corr-120-y', 'user-a')
      `),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("enforces party and project ownership across commercial references", async () => {
    await pool!.query(`
      insert into parties (organization_id, id, display_name, normalized_tax_id)
      values ('org-a', 'party-client', 'Client A', '0312345678'),
             ('org-b', 'party-client', 'Client B', '0312345678');
      insert into party_roles (organization_id, party_id, role)
      values ('org-a', 'party-client', 'client');
      insert into party_bank_accounts
        (organization_id, id, party_id, bank_code, normalized_account_number, account_holder_name)
      values ('org-a', 'bank-1', 'party-client', 'VCB', '123456789', 'Client A');
      insert into projects
        (organization_id, id, code, name, client_party_id, owner_user_id, contract_type,
         currency, budget_minor, starts_on)
      values ('org-a', 'project-1', 'WEB-001', 'Web App', 'party-client', 'user-a',
              'fixed_fee', 'VND', 100000000, '2026-08-01');
      insert into contracts
        (organization_id, id, project_id, reference, signed_on, value_minor, currency)
      values ('org-a', 'contract-1', 'project-1', 'NAAI/2026/01', '2026-08-01', 110000000, 'VND');
      insert into milestones
        (organization_id, id, contract_id, name, due_on, amount_minor, sequence)
      values ('org-a', 'milestone-1', 'contract-1', 'Go-live', '2026-10-01', 55000000, 1);
    `);
    await expect(
      pool!.query(`
        insert into projects
          (organization_id, id, code, name, client_party_id, owner_user_id, contract_type,
           currency, budget_minor, starts_on)
        values ('org-b', 'project-x', 'WEB-X', 'Invalid', 'party-client', 'user-a',
                'fixed_fee', 'VND', 1, '2026-08-01')
      `),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      pool!.query(`
        insert into party_bank_accounts
          (organization_id, id, party_id, bank_code, normalized_account_number, account_holder_name)
        values ('org-a', 'bank-2', 'party-client', 'VCB', '123456789', 'Duplicate')
      `),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("enforces journal polarity, tenant references and posted immutability", async () => {
    await pool!.query(`
      insert into journal_entries (organization_id,id,journal_date,description,currency)
      values ('org-a','journal-db-1','2026-08-05','Capital contribution','VND');
      insert into journal_lines (organization_id,journal_id,line_number,account_code,debit_minor)
      values ('org-a','journal-db-1',1,'111',500000000);
      insert into journal_lines (organization_id,journal_id,line_number,account_code,credit_minor)
      values ('org-a','journal-db-1',2,'511',500000000);
    `);
    await expect(
      pool!.query(`insert into journal_lines
        (organization_id,journal_id,line_number,account_code,debit_minor,credit_minor)
        values ('org-a','journal-db-1',3,'111',1,1)`),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      pool!.query(`insert into journal_lines
        (organization_id,journal_id,line_number,account_code,debit_minor)
        values ('org-b','journal-db-1',3,'111',1)`),
    ).rejects.toMatchObject({ code: "23503" });
    await pool!.query(
      "update journal_entries set state='posted',approved_at=now(),approved_by='user-a',approval_reason='Reviewed',posted_at=now(),posted_by='user-a' where organization_id='org-a' and id='journal-db-1'",
    );
    await expect(
      pool!.query(
        "update journal_entries set description='Changed' where organization_id='org-a' and id='journal-db-1'",
      ),
    ).rejects.toMatchObject({ code: "55000" });
    await expect(
      pool!.query(
        "update journal_lines set debit_minor=2 where organization_id='org-a' and journal_id='journal-db-1' and line_number=1",
      ),
    ).rejects.toMatchObject({ code: "55000" });
  });

  it("stores immutable organization-scoped effective posting rule versions", async () => {
    await pool!.query(`insert into posting_rule_versions
      (organization_id,rule_id,version,name,document_type,effective_from,status,conditions,line_templates,change_reason,correlation_id,created_by)
      values ('org-a','expense-default',1,'Expense default','expense','2026-01-01','active','{}',
        '[{"side":"debit","accountCode":"511"},{"side":"credit","accountCode":"111"}]',
        'Initial rule','corr-rule-1','user-a')`);
    await expect(
      pool!.query(`insert into posting_rule_versions
        (organization_id,rule_id,version,name,document_type,effective_from,status,conditions,line_templates,change_reason,correlation_id,created_by)
        values ('org-a','bad-rule',1,'Bad','expense','2026-01-01','active','{}','[]','Bad','corr','user-a')`),
    ).rejects.toMatchObject({ code: "23514" });
    const foreign = await pool!.query(
      "select count(*)::int count from posting_rule_versions where organization_id='org-b' and rule_id='expense-default'",
    );
    expect(foreign.rows[0].count).toBe(0);
  });

  it("requires an explicit bounded threshold for small-team self approval", async () => {
    await expect(
      pool!.query(`insert into accounting_workflow_policies
        (organization_id,allow_self_approval,updated_by)
        values ('org-a',true,'user-a')`),
    ).rejects.toMatchObject({ code: "23514" });
    await pool!.query(`insert into accounting_workflow_policies
      (organization_id,allow_self_approval,self_approval_max_minor,updated_by)
      values ('org-a',true,1000000,'user-a')`);
    await expect(
      pool!.query(`insert into accounting_workflow_policies
        (organization_id,allow_self_approval,self_approval_max_minor,updated_by)
        values ('org-b',false,1,'user-a')`),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("rejects overlapping periods and keeps close/reopen events organization scoped", async () => {
    await expect(
      pool!.query(`insert into fiscal_periods
        (organization_id,fiscal_year,period_number,starts_on,ends_on)
        values ('org-a',2026,9,'2026-08-15','2026-09-15')`),
    ).rejects.toMatchObject({ code: "23514" });
    await pool!.query(`insert into fiscal_period_events
      (organization_id,id,fiscal_year,period_number,action,from_state,to_state,actor_id,reason,correlation_id)
      values ('org-a','period-event-1',2026,8,'close','open','soft_locked','user-a','Month end','corr-period-1')`);
    await expect(
      pool!.query(`insert into fiscal_period_events
        (organization_id,id,fiscal_year,period_number,action,from_state,to_state,actor_id,reason,correlation_id)
        values ('org-b','period-event-x',2026,8,'close','open','soft_locked','user-a','Invalid','corr-x')`),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      pool!.query(`update fiscal_periods set state='soft_locked'
        where organization_id='org-a' and fiscal_year=2026 and period_number=8`),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("enforces ERP-400 bank source uniqueness tenant ownership and append-only history", async () => {
    await pool!.query(`
      insert into accounts (organization_id,code,name,root_type)
      values ('org-a','11299','ERP-400 bank','asset');
      insert into financial_accounts
        (organization_id,id,code,kind,display_name,currency,ledger_account_code,bank_code,created_by,updated_by)
      values ('org-a','financial-db-1','BANK-DB-1','bank','Database bank','VND','11299','VCB','user-a','user-a');
      insert into bank_transactions
        (organization_id,id,financial_account_id,provider_transaction_id,fingerprint,booking_date,amount_minor,currency,description)
      values ('org-a','bank-txn-db-1','financial-db-1','provider-db-1',repeat('a',64),'2026-08-05',100,'VND','Receipt');
      insert into bank_transaction_normalizations
        (organization_id,transaction_id,version,adapter_id,adapter_version,normalized_payload,normalized_sha256,created_by)
      values ('org-a','bank-txn-db-1',1,'generic-csv',1,'{}',repeat('b',64),'user-a');
      insert into bank_statement_imports
        (organization_id,id,financial_account_id,adapter_id,adapter_version,source_filename,content_sha256,
         row_count,imported_count,duplicate_count,rejected_count,created_by,correlation_id)
      values ('org-a','bank-import-db-1','financial-db-1','generic-csv',1,'statement.csv',repeat('c',64),1,1,0,0,'user-a','corr-bank-db');
      insert into bank_statement_import_rows
        (organization_id,import_id,row_number,raw_payload,raw_sha256,outcome,transaction_id)
      values ('org-a','bank-import-db-1',1,'{}',repeat('d',64),'imported','bank-txn-db-1');
      insert into bank_transaction_events
        (organization_id,id,transaction_id,action,to_state,actor_id,reason,correlation_id)
      values ('org-a','bank-event-db-1','bank-txn-db-1','import','imported','user-a','Imported','corr-bank-db');
    `);
    await expect(
      pool!.query(`insert into financial_accounts
        (organization_id,id,code,kind,display_name,currency,ledger_account_code,bank_code,created_by,updated_by)
        values ('org-b','foreign-bank','FOREIGN','bank','Foreign','VND','11299','VCB','user-a','user-a')`),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      pool!.query(`insert into bank_transactions
        (organization_id,id,financial_account_id,fingerprint,booking_date,amount_minor,currency,description)
        values ('org-a','bank-txn-db-2','financial-db-1',repeat('a',64),'2026-08-05',100,'VND','Duplicate')`),
    ).rejects.toMatchObject({ code: "23505" });
    await expect(
      pool!.query(
        "update bank_statement_import_rows set raw_payload='{\"changed\":\"yes\"}' where organization_id='org-a' and import_id='bank-import-db-1'",
      ),
    ).rejects.toThrow();
    await expect(
      pool!.query(
        "delete from bank_transaction_normalizations where organization_id='org-a' and transaction_id='bank-txn-db-1'",
      ),
    ).rejects.toThrow();
    await expect(
      pool!.query(
        "update bank_transaction_events set reason='Changed' where organization_id='org-a' and id='bank-event-db-1'",
      ),
    ).rejects.toThrow();
  });

  it("enforces ERP-440 statement-session import ownership and exception metadata", async () => {
    await pool!.query(`
      insert into bank_statement_sessions
        (organization_id,id,financial_account_id,period_start,period_end,opening_balance_minor,closing_balance_minor,currency,created_by,correlation_id)
      values ('org-a','statement-session-db-1','financial-db-1','2026-08-01','2026-08-31',0,100,'VND','user-a','corr-control-db');
      insert into bank_statement_session_imports(organization_id,session_id,import_id)
      values ('org-a','statement-session-db-1','bank-import-db-1');
      insert into bank_control_exceptions
        (organization_id,id,session_id,bank_transaction_id,kind,amount_minor,currency,owner_id,reason,review_due,created_by,correlation_id)
      values ('org-a','control-exception-db-1','statement-session-db-1','bank-txn-db-1','suspense',100,'VND','user-a','Needs review','2026-09-05','user-a','corr-control-db');
    `);
    await expect(
      pool!.query(`insert into bank_statement_session_imports(organization_id,session_id,import_id)
        values ('org-a','statement-session-db-1','bank-import-db-1')`),
    ).rejects.toMatchObject({ code: "23505" });
    await expect(
      pool!.query(`insert into bank_control_exceptions
        (organization_id,id,session_id,bank_transaction_id,kind,amount_minor,currency,owner_id,reason,review_due,status,created_by,correlation_id)
        values ('org-a','control-exception-db-2','statement-session-db-1','bank-txn-db-1','suspense',100,'VND','user-a','Bad approval','2026-09-05','approved','user-a','corr-control-db')`),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("preserves ERP-410 reconciliation attempt history and one active attempt", async () => {
    await pool!.query(`
      insert into reconciliation_candidate_runs
        (organization_id,id,bank_transaction_id,algorithm_version,threshold_bps,ambiguity_margin_bps,created_by,correlation_id)
      values ('org-a','candidate-run-db-1','bank-txn-db-1',1,7000,1000,'user-a','corr-rec-db');
      insert into payment_reconciliations
        (organization_id,id,bank_transaction_id,direction,statement_amount_minor,statement_currency,current_attempt_number,created_by)
      values ('org-a','reconciliation-db-1','bank-txn-db-1','receipt',100,'VND',1,'user-a');
      insert into reconciliation_attempts
        (organization_id,id,reconciliation_id,attempt_number,bank_transaction_id,state,bank_amount_minor,bank_currency,
         base_amount_minor,candidate_run_id,policy_version,candidate_generation,created_by)
      values ('org-a','attempt-db-1','reconciliation-db-1',1,'bank-txn-db-1','matched',100,'VND',100,
              'candidate-run-db-1',1,1,'user-a');
      insert into reconciliation_events
        (organization_id,id,reconciliation_id,bank_transaction_id,action,from_state,to_state,actor_id,reason,correlation_id)
      values ('org-a','reconciliation-event-db-1','attempt-db-1','bank-txn-db-1','match','suggested','matched','user-a','Matched','corr-rec-db');
    `);
    await expect(
      pool!.query(`insert into reconciliation_attempts
        (organization_id,id,reconciliation_id,attempt_number,bank_transaction_id,state,bank_amount_minor,bank_currency,
         base_amount_minor,candidate_run_id,policy_version,candidate_generation,created_by)
        values ('org-a','attempt-db-2','reconciliation-db-1',2,'bank-txn-db-1','matched',100,'VND',100,
                'candidate-run-db-1',1,1,'user-a')`),
    ).rejects.toMatchObject({ code: "23505" });
    await expect(
      pool!.query(
        "update reconciliation_candidate_runs set threshold_bps=1 where organization_id='org-a' and id='candidate-run-db-1'",
      ),
    ).rejects.toThrow();
    await expect(
      pool!.query(
        "delete from reconciliation_events where organization_id='org-a' and id='reconciliation-event-db-1'",
      ),
    ).rejects.toThrow();
  });

  it("enforces ERP-420 organization-scoped active transfer claims and append-only events", async () => {
    await pool!.query(`
      insert into internal_transfers
        (organization_id,id,state,currency,transfer_amount_minor,base_principal_amount_minor,transit_account_code,current_attempt_number,created_by)
      values ('org-a','transfer-db-1','pending_counterpart','VND',100,100,'11299',1,'user-a');
      insert into internal_transfer_attempts
        (organization_id,id,transfer_id,attempt_number,state,posting_mode,outgoing_transaction_id,correlation_id,created_by)
      values ('org-a','transfer-attempt-db-1','transfer-db-1',1,'pending_counterpart','transit','bank-txn-db-1','corr-transfer-db','user-a');
      insert into internal_transfer_claims
        (organization_id,bank_transaction_id,transfer_id,attempt_number,role)
      values ('org-a','bank-txn-db-1','transfer-db-1',1,'source');
      insert into internal_transfer_events
        (organization_id,id,transfer_id,attempt_number,action,actor_id,reason,correlation_id)
      values ('org-a','transfer-event-db-1','transfer-db-1',1,'create','user-a','First leg','corr-transfer-db');
    `);
    await expect(
      pool!.query(`insert into internal_transfer_claims
        (organization_id,bank_transaction_id,transfer_id,attempt_number,role)
        values ('org-a','bank-txn-db-1','transfer-db-1',1,'source')`),
    ).rejects.toMatchObject({ code: "23505" });
    await expect(
      pool!.query(
        "update internal_transfer_attempts set state='needs_review' where organization_id='org-a' and id='transfer-attempt-db-1'",
      ),
    ).rejects.toThrow();
    await expect(
      pool!.query(
        "delete from internal_transfer_events where organization_id='org-a' and id='transfer-event-db-1'",
      ),
    ).rejects.toThrow();
  });
});
