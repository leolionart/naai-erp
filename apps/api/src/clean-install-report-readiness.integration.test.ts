import { createHash } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedTt133Mvp } from "../../../db/seed/tt133-mvp.mjs";
import { createApp } from "./bootstrap.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration("ERP-730 explicit clean-install TT133 MVP setup", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const organizationId = "org-clean-install";
  const token = "clean-install-accountant";
  const fiscalYear = 2026;
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeAll(async () => {
    await seedTt133Mvp(pool, {
      organizationId,
      legalName: "Synthetic Clean Install",
      fiscalYear,
    });
    await pool.query(
      `insert into api_credentials(organization_id,id,actor_id,token_hash,roles)
       values($1,'clean-install-credential','clean-install-accountant',$2,'["accountant"]')
       on conflict (organization_id,id) do update set
         token_hash=excluded.token_hash,
         roles=excluded.roles,
         status='active'`,
      [organizationId, createHash("sha256").update(token).digest("hex")],
    );
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
    await pool.end();
  });

  const headers = { authorization: `Bearer ${token}` };
  const range =
    "startsOn=2026-01-01&endsOn=2026-12-31&asOfInstant=2026-12-31T16%3A59%3A59.000Z&framework=TT133";

  it("is idempotent and creates the minimum reviewed setup", async () => {
    await seedTt133Mvp(pool, { organizationId, legalName: "Ignored on replay", fiscalYear });
    const result = await pool.query<{
      accounts: string;
      taxes: string;
      categories: string;
      mappings: string;
      periods: string;
      cashAccounts: string;
    }>(
      `select
        (select count(*) from accounts where organization_id=$1)::text accounts,
        (select count(*) from tax_code_versions where organization_id=$1 and review_state='accountant_approved')::text taxes,
        (select count(*) from default_mapping_versions where organization_id=$1)::text categories,
        (select count(*) from financial_statement_mapping_versions where organization_id=$1 and framework='TT133' and state='approved')::text mappings,
        (select count(*) from fiscal_periods where organization_id=$1 and fiscal_year=$2)::text periods,
        (select count(*) from financial_accounts where organization_id=$1 and status='active' and kind='cash')::text "cashAccounts"`,
      [organizationId, fiscalYear],
    );
    expect(result.rows[0]).toEqual({
      accounts: "15",
      taxes: "4",
      categories: "4",
      mappings: "1",
      periods: "12",
      cashAccounts: "1",
    });
  });

  it("loads basic financial and VAT reports without REPORT_MAPPING_NOT_FOUND", async () => {
    const requests = [
      `/api/v1/organizations/${organizationId}/reports/financial-statements/profit-and-loss?${range}`,
      `/api/v1/organizations/${organizationId}/reports/financial-statements/balance-sheet?endsOn=2026-12-31&asOfInstant=2026-12-31T16%3A59%3A59.000Z&framework=TT133`,
      `/api/v1/organizations/${organizationId}/reports/financial-statements/cash-flow?${range}`,
      `/api/v1/organizations/${organizationId}/reports/tax/vat-reconciliation?${range}`,
    ];
    for (const url of requests) {
      const response = await app.inject({ method: "GET", url, headers });
      expect(response.statusCode, response.body).toBe(200);
      expect(response.body).not.toContain("REPORT_MAPPING_NOT_FOUND");
      expect(response.json()).toMatchObject({ organizationId, data: { currency: "VND" } });
    }
  });
});
