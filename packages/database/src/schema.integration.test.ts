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
});
