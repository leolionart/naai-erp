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
});
