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
});
