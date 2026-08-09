import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && Boolean(process.env.DATABASE_URL);
const suite = enabled ? describe : describe.skip;

suite("ERP-853 empty organization restore", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const suffix = randomUUID();
  const source = `restore-source-${suffix}`;
  const target = `restore-target-${suffix}`;
  const actor = `restore-owner-${suffix}`;
  const sourceToken = `source-token-${suffix}`;
  const targetToken = `target-token-${suffix}`;
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeAll(async () => {
    await pool.query(
      "insert into organizations(id,legal_name,base_currency,timezone) values($1,'Source','VND','Asia/Ho_Chi_Minh'),($2,'Target','VND','Asia/Ho_Chi_Minh')",
      [source, target],
    );
    await pool.query("insert into users(id,email,display_name) values($1,$2,'Restore Owner')", [
      actor,
      `${suffix}@example.com`,
    ]);
    await pool.query(
      "insert into organization_memberships(organization_id,user_id) values($1,$3),($2,$3)",
      [source, target, actor],
    );
    await pool.query(
      "insert into membership_roles(organization_id,user_id,role) values($1,$3,'owner'),($2,$3,'owner')",
      [source, target, actor],
    );
    await pool.query(
      `insert into api_credentials(organization_id,id,actor_id,token_hash,roles) values ($1,'source-credential',$3,$4,'["owner"]'),($2,'target-credential',$3,$5,'["owner"]')`,
      [
        source,
        target,
        actor,
        createHash("sha256").update(sourceToken).digest("hex"),
        createHash("sha256").update(targetToken).digest("hex"),
      ],
    );
    await pool.query(
      "insert into accounts(organization_id,code,name,root_type) values($1,'112','Bank','asset'),($1,'411','Capital','equity')",
      [source],
    );
    await pool.query(
      "insert into financial_accounts(organization_id,id,code,kind,display_name,currency,ledger_account_code,bank_code,status,created_by,updated_by) values($1,'bank-1','BANK','bank','Company bank','VND','112','VCB','active',$2,$2)",
      [source, actor],
    );
    await pool.query(
      "insert into bank_transactions(organization_id,id,financial_account_id,fingerprint,booking_date,amount_minor,currency,description) values($1,'bank-tx-1','bank-1',$2,'2026-08-08',500,'VND','Opening bank activity')",
      [source, createHash("sha256").update(`bank-${suffix}`).digest("hex")],
    );
    await pool.query(
      "insert into journal_entries(organization_id,id,journal_date,description,currency,state,version,created_by,approved_at,approved_by,approval_reason,posted_at,posted_by) values($1,'journal-1','2026-08-08','Opening capital','VND','posted',2,$2,now(),$2,'fixture',now(),$2)",
      [source, actor],
    );
    await pool.query(
      "insert into journal_lines(organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions) values($1,'journal-1',1,'112',500,null,'Bank','{}'),($1,'journal-1',2,'411',null,500,'Capital','{}')",
      [source],
    );
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
    await pool.end();
  });

  it("exports and atomically restores ledger and bank rows into the confirmed empty target", async () => {
    const exported = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${source}/portable-data-packages/exports`,
      headers: { authorization: `Bearer ${sourceToken}`, "idempotency-key": `export-${suffix}` },
      // Keep the export cutoff after fixture creation so this integration test
      // does not start exporting an empty package when the calendar advances.
      payload: { asOf: "2099-12-31" },
    });
    expect(exported.statusCode, exported.body).toBe(201);
    expect(exported.json().data.manifest.sheets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ resourceType: "api_credentials", excluded: true }),
        expect.objectContaining({ resourceType: "evidence_records", excluded: true }),
        expect.objectContaining({ resourceType: "evidence_versions", excluded: true }),
      ]),
    );
    const packageId = exported.json().data.packageId as string;
    const downloaded = await app.inject({
      method: "GET",
      url: `/api/v1/organizations/${source}/portable-data-packages/exports/${packageId}/download`,
      headers: { authorization: `Bearer ${sourceToken}` },
    });
    const content = downloaded.rawPayload;
    const workbookSha256 = createHash("sha256").update(content).digest("hex");
    const request = {
      method: "POST" as const,
      url: `/api/v1/organizations/${target}/portable-data-packages/imports/restore-empty`,
      headers: { authorization: `Bearer ${targetToken}`, "idempotency-key": `restore-${suffix}` },
      payload: {
        sourceOrganizationId: source,
        confirmTargetOrganizationId: target,
        packageId,
        workbookSha256,
        reason: "Verified production cutover fixture",
        workbookBase64: content.toString("base64"),
        mapSourceActorsToTargetActor: true,
      },
    };
    const restored = await app.inject(request);
    expect(restored.statusCode, restored.body).toBe(201);
    expect(restored.json().data).toMatchObject({
      sourceOrganizationId: source,
      targetOrganizationId: target,
      packageId,
      sourceHash: restored.json().data.targetHash,
      balancedJournalCount: 1,
      idempotencyReplayed: false,
    });
    const counts = await pool.query(
      `select
        (select count(*)::int from journal_entries where organization_id=$1) journals,
        (select count(*)::int from journal_lines where organization_id=$1) lines,
        (select count(*)::int from bank_transactions where organization_id=$1) bank_rows,
        (select count(*)::int from api_credentials where organization_id=$1) credentials`,
      [target],
    );
    expect(counts.rows[0]).toEqual({ journals: 1, lines: 2, bank_rows: 1, credentials: 1 });
    const replay = await app.inject(request);
    expect(replay.statusCode, replay.body).toBe(201);
    expect(replay.json().data.idempotencyReplayed).toBe(true);
    const nonEmpty = await app.inject({
      ...request,
      headers: { ...request.headers, "idempotency-key": `restore-again-${suffix}` },
    });
    expect(nonEmpty.statusCode).toBeGreaterThanOrEqual(400);
    expect(nonEmpty.json().error.code).toBe("RESTORE_TARGET_NOT_EMPTY");
  });
});
