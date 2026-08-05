import { createHash } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration("ERP-240 opening balances and ledger reports", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  let app: Awaited<ReturnType<typeof createApp>>;
  const financeToken = "erp240-finance";
  const approverToken = "erp240-approver";

  beforeAll(async () => {
    await pool.query(`
      insert into organizations (id,legal_name,base_currency,timezone)
      values ('org-report','Report Org','VND','Asia/Ho_Chi_Minh');
      insert into fiscal_years (organization_id,year,starts_on,ends_on)
      values ('org-report',2026,'2026-01-01','2026-12-31');
      insert into fiscal_periods (organization_id,fiscal_year,period_number,starts_on,ends_on)
      values ('org-report',2026,1,'2026-01-01','2026-01-31');
      insert into accounts (organization_id,code,name,root_type,is_control_account,allow_manual_posting)
      values ('org-report','111-BANK','Bank','asset',false,true),
             ('org-report','131-AR','Accounts receivable','asset',true,false),
             ('org-report','331-AP','Accounts payable','liability',true,false),
             ('org-report','411-CAPITAL','Owner capital','equity',false,true);
    `);
    await pool.query(
      `insert into api_credentials (organization_id,id,actor_id,token_hash,roles)
       values ('org-report','report-finance','finance-user',$1,'["finance_admin"]'),
              ('org-report','report-approver','approver-user',$2,'["approver","accountant"]')`,
      [
        createHash("sha256").update(financeToken).digest("hex"),
        createHash("sha256").update(approverToken).digest("hex"),
      ],
    );
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
    await pool.end();
  });

  const opening = {
    importId: "opening-2026",
    openingDate: "2026-01-01",
    currency: "VND",
    description: "Approved opening balances",
    controlDebitMinor: "500000000",
    controlCreditMinor: "500000000",
    lines: [
      { accountCode: "111-BANK", debitMinor: "330000000" },
      {
        accountCode: "131-AR",
        debitMinor: "120000000",
        dimensions: { partyId: "client-a", documentRef: "AR-OPEN-001" },
      },
      {
        accountCode: "331-AP",
        creditMinor: "50000000",
        dimensions: { partyId: "supplier-a", documentRef: "AP-OPEN-001" },
      },
      { accountCode: "411-CAPITAL", creditMinor: "450000000" },
      { accountCode: "111-BANK", debitMinor: "50000000" },
    ],
  } as const;

  it("dry-runs, creates idempotently, approves and posts through the normal journal workflow", async () => {
    const auth = { authorization: `Bearer ${financeToken}` };
    const dryRun = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-report/opening-balances/dry-run",
      headers: auth,
      payload: opening,
    });
    expect(dryRun.statusCode).toBe(201);
    expect(dryRun.json().data).toMatchObject({ valid: true, differenceMinor: "0", lineCount: 5 });
    const request = {
      method: "POST" as const,
      url: "/api/v1/organizations/org-report/opening-balances",
      headers: { ...auth, "idempotency-key": "opening-create-1" },
      payload: opening,
    };
    const created = await app.inject(request);
    expect(created.statusCode).toBe(201);
    const journalId = created.json().data.journalId as string;
    expect((await app.inject(request)).json().data.idempotencyReplayed).toBe(true);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/v1/organizations/org-report/journals/${journalId}/approve`,
          headers: {
            authorization: `Bearer ${approverToken}`,
            "idempotency-key": "opening-approve-1",
          },
          payload: { reason: "Opening controls reviewed" },
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/v1/organizations/org-report/journals/${journalId}/post`,
          headers: { ...auth, "idempotency-key": "opening-post-1" },
        })
      ).statusCode,
    ).toBe(201);
    const readback = await app.inject({
      method: "GET",
      url: "/api/v1/organizations/org-report/opening-balances/opening-2026",
      headers: auth,
    });
    expect(readback.json().data).toMatchObject({ status: "posted", journal_state: "posted" });
  });

  it("reports only posted history and returns balanced drill-down", async () => {
    const headers = { authorization: `Bearer ${financeToken}` };
    const trial = await app.inject({
      method: "GET",
      url: "/api/v1/organizations/org-report/reports/trial-balance?from=2026-01-01&to=2026-01-31",
      headers,
    });
    expect(trial.statusCode).toBe(200);
    expect(trial.json().data).toMatchObject({
      balanced: true,
      totals: {
        periodDebitMinor: "500000000",
        periodCreditMinor: "500000000",
        closingDebitMinor: "500000000",
        closingCreditMinor: "500000000",
        differenceMinor: "0",
      },
    });
    const ledger = await app.inject({
      method: "GET",
      url: "/api/v1/organizations/org-report/reports/general-ledger?from=2026-01-01&to=2026-01-31&accountCode=131-AR",
      headers,
    });
    expect(ledger.statusCode).toBe(200);
    expect(ledger.json().data.rows).toEqual([
      expect.objectContaining({
        accountCode: "131-AR",
        debitMinor: "120000000",
        runningBalanceMinor: "120000000",
        dimensions: { partyId: "client-a", documentRef: "AR-OPEN-001" },
      }),
    ]);
  });

  it("rejects variance and missing AR/AP detail with zero journal effects", async () => {
    const before = await pool.query<{ count: string }>(
      "select count(*)::text count from journal_entries where organization_id='org-report'",
    );
    const invalid = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-report/opening-balances/dry-run",
      headers: { authorization: `Bearer ${financeToken}` },
      payload: { ...opening, controlCreditMinor: "499999999" },
    });
    expect(invalid.statusCode).toBe(422);
    const noDetail = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-report/opening-balances/dry-run",
      headers: { authorization: `Bearer ${financeToken}` },
      payload: {
        ...opening,
        lines: opening.lines.map((line) =>
          line.accountCode === "131-AR" ? { accountCode: "131-AR", debitMinor: "120000000" } : line,
        ),
      },
    });
    expect(noDetail.statusCode).toBe(422);
    const after = await pool.query<{ count: string }>(
      "select count(*)::text count from journal_entries where organization_id='org-report'",
    );
    expect(after.rows[0]!.count).toBe(before.rows[0]!.count);
  });
});
