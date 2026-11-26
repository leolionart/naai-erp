import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && Boolean(process.env.DATABASE_URL);
const suite = enabled ? describe : describe.skip;

suite("ERP-986 CIT tiered rate & policy PostgreSQL API", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const org = `org-cit-${randomUUID()}`;
  const owner = `owner-${org}`;
  const token = `cit-token-${org}`;
  let app: Awaited<ReturnType<typeof createApp>>;

  const headers = (idem?: string, ifMatch?: string) => ({
    authorization: `Bearer ${token}`,
    ...(idem ? { "idempotency-key": idem } : {}),
    ...(ifMatch ? { "if-match": ifMatch } : {}),
  });

  beforeAll(async () => {
    await pool.query(
      `insert into organizations(id,legal_name,base_currency,timezone)
       values($1,'CIT Tiered Org','VND','Asia/Ho_Chi_Minh')`,
      [org],
    );
    await pool.query(`insert into users(id,email,display_name) values($1,$2,'Owner')`, [
      owner,
      `${org}@example.com`,
    ]);
    await pool.query(
      `insert into organization_memberships(organization_id,user_id) values($1,$2)`,
      [org, owner],
    );
    await pool.query(
      `insert into membership_roles(organization_id,user_id,role) values($1,$2,'owner')`,
      [org, owner],
    );
    await pool.query(
      `insert into api_credentials(organization_id,id,actor_id,token_hash,roles)
       values($1,'cred-cit',$2,$3,'["owner"]')`,
      [org, owner, createHash("sha256").update(token).digest("hex")],
    );
    await pool.query(
      `insert into accounts(organization_id,code,name,root_type,is_control_account,allow_manual_posting) values
         ($1,'112','Bank','asset',false,true),
         ($1,'511','Service revenue','revenue',false,true),
         ($1,'642','Operating expense','expense',false,true)`,
      [org],
    );
    // Current-year (2026) posted revenue = 500,000,000; expense = 300,000,000 -> profit = 200,000,000.
    await pool.query(
      `insert into journal_entries(organization_id,id,journal_date,description,currency,state,version,created_by,approved_at,approved_by,approval_reason,posted_at,posted_by)
       values
         ($1,'j-2026-rev','2026-06-15','2026 revenue','VND','posted',2,$2,now(),$2,'fixture',now(),$2),
         ($1,'j-2026-exp','2026-06-20','2026 expense','VND','posted',2,$2,now(),$2,'fixture',now(),$2)`,
      [org, owner],
    );
    await pool.query(
      `insert into journal_lines(organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions)
       values
         ($1,'j-2026-rev',1,'112',500000000,null,'Bank','{}'),
         ($1,'j-2026-rev',2,'511',null,500000000,'Revenue','{}'),
         ($1,'j-2026-exp',1,'642',300000000,null,'Expense','{}'),
         ($1,'j-2026-exp',2,'112',null,300000000,'Bank','{}')`,
      [org],
    );

    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
    await pool.end();
  });

  let journalSeq = 0;
  async function post2025RevenueDelta(deltaMinor: bigint) {
    journalSeq += 1;
    const jid = `j-2025-rev-${journalSeq}`;
    await pool.query(
      `insert into journal_entries(organization_id,id,journal_date,description,currency,state,version,created_by,approved_at,approved_by,approval_reason,posted_at,posted_by)
       values($1,$2,'2025-11-10','2025 revenue adjustment','VND','posted',2,$3,now(),$3,'fixture',now(),$3)`,
      [org, jid, owner],
    );
    if (deltaMinor >= 0n) {
      await pool.query(
        `insert into journal_lines(organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions)
         values
           ($1,$2,1,'112',$3,null,'Bank','{}'),
           ($1,$2,2,'511',null,$3,'Revenue','{}')`,
        [org, jid, deltaMinor.toString()],
      );
    } else {
      const absMinor = (-deltaMinor).toString();
      await pool.query(
        `insert into journal_lines(organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions)
         values
           ($1,$2,1,'511',$3,null,'Revenue reversal','{}'),
           ($1,$2,2,'112',null,$3,'Bank reversal','{}')`,
        [org, jid, absMinor],
      );
    }
  }

  it("estimates CIT with no prior-year revenue, exact 3B/50B boundaries, override, and custom year schedule", async () => {
    // 1. No prior-year revenue -> 15% provisionally based on 2026 revenue (500M <= 3B)
    const noPrior = await app.inject({
      method: "GET",
      url: `/api/v1/organizations/${org}/reports/tax/estimated-cit?startsOn=2026-01-01&endsOn=2026-12-31`,
      headers: headers(),
    });
    expect(noPrior.statusCode).toBe(200);
    expect(noPrior.json().data).toMatchObject({
      taxYear: 2026,
      priorYear: 2025,
      taxableProfitMinor: "200000000",
      effectiveRateBps: 1500,
      estimatedCitMinor: "30000000",
      tierCode: "small_15",
      basis: "no_prior_year_revenue",
      status: "review_required",
    });

    // 2. Prior-year revenue = 3,000,000,000 -> 15%
    await post2025RevenueDelta(3_000_000_000n);
    const at3B = await app.inject({
      method: "GET",
      url: `/api/v1/organizations/${org}/reports/tax/estimated-cit?startsOn=2026-01-01&endsOn=2026-12-31`,
      headers: headers(),
    });
    expect(at3B.json().data).toMatchObject({
      effectiveRateBps: 1500,
      estimatedCitMinor: "30000000",
      tierCode: "small_15",
      basis: "prior_year_revenue",
      referenceRevenueMinor: "3000000000",
      status: "ready",
    });

    // Dashboard parity check at 15%
    const dash15 = await app.inject({
      method: "GET",
      url: `/api/v1/organizations/${org}/reports/operating-dashboard?asOf=2026-12-31&startsOn=2026-01-01&endsOn=2026-12-31`,
      headers: headers(),
    });
    expect(dash15.json().data.financials).toMatchObject({
      corporateIncomeTaxRateBps: 1500,
      corporateIncomeTaxMinor: "30000000",
      corporateIncomeTaxTierCode: "small_15",
      corporateIncomeTaxBasis: "prior_year_revenue",
      priorYearRevenueMinor: "3000000000",
    });

    // 3. Prior-year revenue = 3,000,000,001 (+1) and 50,000,000,000 (+46,999,999,999) -> 17%
    for (const delta of [1n, 46_999_999_999n]) {
      await post2025RevenueDelta(delta);
      const res17 = await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${org}/reports/tax/estimated-cit?startsOn=2026-01-01&endsOn=2026-12-31`,
        headers: headers(),
      });
      expect(res17.json().data).toMatchObject({
        effectiveRateBps: 1700,
        estimatedCitMinor: "34000000",
        tierCode: "medium_17",
        basis: "prior_year_revenue",
      });
    }

    // 4. Prior-year revenue = 50,000,000,001 (+1) -> 20%
    await post2025RevenueDelta(1n);
    const above50B = await app.inject({
      method: "GET",
      url: `/api/v1/organizations/${org}/reports/tax/estimated-cit?startsOn=2026-01-01&endsOn=2026-12-31`,
      headers: headers(),
    });
    expect(above50B.json().data).toMatchObject({
      effectiveRateBps: 2000,
      estimatedCitMinor: "40000000",
      tierCode: "standard_20",
      basis: "prior_year_revenue",
    });

    // 5. Net prior-year revenue back down to 1B via reversal (-49,000,000,001 -> would be 15%), then set citSmallEnterpriseIneligible override -> 20%
    await post2025RevenueDelta(-49_000_000_001n);
    const putOverride = await app.inject({
      method: "PUT",
      url: `/api/v1/organizations/${org}/cit-policy`,
      headers: headers("idem-cit-override", "0"),
      payload: {
        citSmallEnterpriseIneligible: true,
        ineligibilityReason: "Quan hệ liên kết tập đoàn",
        reason: "Khai báo không đủ điều kiện SME",
      },
    });
    expect(putOverride.statusCode).toBe(200);
    expect(putOverride.json().data).toMatchObject({
      idempotencyReplayed: false,
      policy: {
        citSmallEnterpriseIneligible: true,
        ineligibilityReason: "Quan hệ liên kết tập đoàn",
        version: "1",
      },
    });

    // Idempotent replay returns same result with idempotencyReplayed: true
    const replayOverride = await app.inject({
      method: "PUT",
      url: `/api/v1/organizations/${org}/cit-policy`,
      headers: headers("idem-cit-override", "0"),
      payload: {
        citSmallEnterpriseIneligible: true,
        ineligibilityReason: "Quan hệ liên kết tập đoàn",
        reason: "Khai báo không đủ điều kiện SME",
      },
    });
    expect(replayOverride.statusCode).toBe(200);
    expect(replayOverride.json().data.idempotencyReplayed).toBe(true);

    const overriddenReport = await app.inject({
      method: "GET",
      url: `/api/v1/organizations/${org}/reports/tax/estimated-cit?startsOn=2026-01-01&endsOn=2026-12-31`,
      headers: headers(),
    });
    expect(overriddenReport.json().data).toMatchObject({
      effectiveRateBps: 2000,
      estimatedCitMinor: "40000000",
      basis: "ineligible_override",
      citSmallEnterpriseIneligible: true,
    });
    expect(overriddenReport.json().data.assumption).toContain("Quan hệ liên kết tập đoàn");

    // 6. Configurable rate tiers by year (2026 custom tier schedule after clearing override)
    await app.inject({
      method: "PUT",
      url: `/api/v1/organizations/${org}/cit-policy`,
      headers: headers("idem-cit-clear", "1"),
      payload: {
        citSmallEnterpriseIneligible: false,
        reason: "Clear SME override",
      },
    });
    const customTiers = await app.inject({
      method: "PUT",
      url: `/api/v1/organizations/${org}/cit-policy/rate-tiers/2026`,
      headers: headers("idem-cit-tiers-2026"),
      payload: {
        lawReference: "Custom 2026 Policy",
        tiers: [
          {
            tierCode: "tier_10",
            label: "<= 2B (10%)",
            maxRevenueMinor: "2000000000",
            rateBps: 1000,
          },
          {
            tierCode: "standard_20",
            label: "> 2B (20%)",
            maxRevenueMinor: null,
            rateBps: 2000,
          },
        ],
        reason: "Configure custom 2026 schedule",
      },
    });
    expect(customTiers.statusCode).toBe(200);

    const customReport = await app.inject({
      method: "GET",
      url: `/api/v1/organizations/${org}/reports/tax/estimated-cit?startsOn=2026-01-01&endsOn=2026-12-31`,
      headers: headers(),
    });
    expect(customReport.json().data).toMatchObject({
      effectiveRateBps: 1000,
      estimatedCitMinor: "20000000",
      tierCode: "tier_10",
      scheduleSource: "organization",
      lawReference: "Custom 2026 Policy",
    });
  });
});
