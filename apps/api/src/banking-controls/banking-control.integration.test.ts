import { createHash } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";
const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL,
  suite = enabled ? describe : describe.skip;
suite("ERP-440 statement controls PostgreSQL API", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  let app: Awaited<ReturnType<typeof createApp>>;
  const token = "erp440-token",
    headers = (key?: string) => ({
      authorization: `Bearer ${token}`,
      "x-correlation-id": `corr-${key ?? "read"}`,
      ...(key ? { "idempotency-key": key } : {}),
    });
  beforeAll(async () => {
    await pool.query(
      `insert into organizations(id,legal_name,base_currency,timezone)values('org-erp440','ERP440','VND','Asia/Ho_Chi_Minh'),('org-erp440-other','Other','VND','Asia/Ho_Chi_Minh');insert into accounts(organization_id,code,name,root_type)values('org-erp440','112','Bank','asset'),('org-erp440-other','112','Bank','asset');insert into financial_accounts(organization_id,id,code,kind,display_name,currency,ledger_account_code,bank_code,created_by,updated_by)values('org-erp440','bank','BANK','bank','Bank','VND','112','BANK','finance','finance');insert into bank_statement_imports(organization_id,id,financial_account_id,adapter_id,adapter_version,source_filename,content_sha256,row_count,imported_count,duplicate_count,rejected_count,created_by,correlation_id)values('org-erp440','import-1','bank','generic-csv',1,'aug.csv',repeat('a',64),1,1,0,0,'finance','corr'),('org-erp440','import-2','bank','generic-csv',1,'sep.csv',repeat('d',64),0,0,0,0,'finance','corr');insert into bank_transactions(organization_id,id,financial_account_id,fingerprint,booking_date,amount_minor,currency,description,state)values('org-erp440','txn-1','bank',repeat('b',64),'2026-08-10',20,'VND','Receipt','reconciled');insert into bank_statement_import_rows(organization_id,import_id,row_number,raw_payload,raw_sha256,outcome,error_codes,transaction_id)values('org-erp440','import-1',1,'{}',repeat('c',64),'imported','[]','txn-1');insert into journal_entries(organization_id,id,journal_date,description,currency,state,version,created_by,approved_at,approved_by,approval_reason,posted_at,posted_by)values('org-erp440','journal-1','2026-08-10','Receipt','VND','posted',2,'finance',now(),'finance','Approved',now(),'finance');insert into journal_lines(organization_id,journal_id,line_number,account_code,debit_minor,description,dimensions)values('org-erp440','journal-1',1,'112',20,'Bank','{}');`,
    );
    await pool.query(
      "insert into api_credentials(organization_id,id,actor_id,token_hash,roles)values('org-erp440','cred','finance',$1,'[\"finance_admin\"]')",
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
  it("derives controls, reviews, closes idempotently and preserves audit", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-erp440/banking/statement-sessions",
      headers: headers("create"),
      payload: {
        schemaVersion: 1,
        id: "session-1",
        financialAccountId: "bank",
        currency: "VND",
        periodStart: "2026-08-01",
        periodEnd: "2026-08-31",
        openingBalanceMinor: "100",
        closingBalanceMinor: "120",
        importIds: ["import-1"],
        reason: "August close",
      },
    });
    expect(create.statusCode, create.body).toBe(201);
    expect(create.json().data.statementSession).toMatchObject({
      session: { state: "draft" },
      control: {
        expectedMovementMinor: "20",
        controlDifferenceMinor: "0",
        closable: false,
        closeBlockers: ["statement_not_reviewed"],
      },
    });
    const review = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-erp440/banking/statement-sessions/session-1/review",
      headers: headers("review"),
      payload: { schemaVersion: 1, expectedResourceVersion: "1", reason: "Reviewed" },
    });
    expect(review.statusCode, review.body).toBe(201);
    expect(review.json().data.statementSession).toMatchObject({
      session: { state: "reviewed", resourceVersion: "2" },
      control: { closable: true },
    });
    const close = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-erp440/banking/statement-sessions/session-1/close",
      headers: headers("close"),
      payload: { schemaVersion: 1, expectedResourceVersion: "2", reason: "All controls passed" },
    });
    expect(close.statusCode, close.body).toBe(201);
    expect(close.json().data.statementSession.session).toMatchObject({
      state: "closed",
      resourceVersion: "3",
    });
    const replay = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-erp440/banking/statement-sessions/session-1/close",
      headers: headers("close"),
      payload: { schemaVersion: 1, expectedResourceVersion: "2", reason: "All controls passed" },
    });
    expect(replay.statusCode).toBe(201);
    const audit = await pool.query(
      "select count(*)::int count from resource_audit_events where organization_id='org-erp440'and resource_type='bank_statement_control'and resource_key='session-1'",
    );
    expect(audit.rows[0].count).toBe(3);
  });
  it("blocks cross-org access and mismatched statement controls", async () => {
    const denied = await app.inject({
      method: "GET",
      url: "/api/v1/organizations/org-erp440-other/banking/statement-sessions",
      headers: headers(),
    });
    expect(denied.statusCode).toBe(403);
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-erp440/banking/statement-sessions",
      headers: headers("bad-create"),
      payload: {
        schemaVersion: 1,
        id: "session-bad",
        financialAccountId: "bank",
        currency: "VND",
        periodStart: "2026-09-01",
        periodEnd: "2026-09-30",
        openingBalanceMinor: "0",
        closingBalanceMinor: "1",
        importIds: ["import-2"],
        reason: "Bad close",
      },
    });
    expect(create.statusCode, create.body).toBe(201);
    const review = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-erp440/banking/statement-sessions/session-bad/review",
      headers: headers("bad-review"),
      payload: { schemaVersion: 1, expectedResourceVersion: "1", reason: "Review mismatch" },
    });
    expect(review.statusCode).toBe(201);
    const close = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-erp440/banking/statement-sessions/session-bad/close",
      headers: headers("bad-close"),
      payload: { schemaVersion: 1, expectedResourceVersion: "2", reason: "Must block" },
    });
    expect(close.statusCode).toBe(409);
  });
});
