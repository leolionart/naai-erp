import { createHash } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration("ERP-320 evidence management", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  let app: Awaited<ReturnType<typeof createApp>>;
  const token = "erp320-accountant";
  const otherToken = "erp320-other";
  beforeAll(async () => {
    await pool.query(`
      insert into organizations(id,legal_name,base_currency,timezone) values
        ('org-evidence','Evidence Org','VND','Asia/Ho_Chi_Minh'),
        ('org-evidence-other','Other Org','VND','Asia/Ho_Chi_Minh');
      insert into accounts(organization_id,code,name,root_type) values
        ('org-evidence','111','Cash','asset'),('org-evidence','642','Expense','expense');
      insert into expenses(organization_id,id,expense_class,expense_date,business_purpose,currency,net_minor,vat_minor,gross_minor,counter_account_code,created_by)
        values('org-evidence','expense-evidence','non_documented','2026-08-05','Evidence test','VND',1000,0,1000,'111','maker');
    `);
    await pool.query(
      `insert into api_credentials(organization_id,id,actor_id,token_hash,roles) values
       ('org-evidence','evidence-user','accountant',$1,'["accountant"]'),
       ('org-evidence-other','other-user','other',$2,'["accountant"]')`,
      [
        createHash("sha256").update(token).digest("hex"),
        createHash("sha256").update(otherToken).digest("hex"),
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
  const headers = (value: string, key: string) => ({
    authorization: `Bearer ${value}`,
    "idempotency-key": key,
  });
  const pdf = Buffer.from("%PDF-1.7\nNAAI ERP evidence fixture");
  const upload = (key: string, evidenceId?: string, filename = "invoice.pdf") =>
    app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-evidence/evidence",
      headers: headers(token, key),
      payload: {
        ...(evidenceId ? { evidenceId } : {}),
        subjectType: "expense",
        subjectId: "expense-evidence",
        evidenceType: "invoice",
        originalFilename: filename,
        declaredMediaType: "application/pdf",
        contentBase64: pdf.toString("base64"),
        source: "integration-test",
      },
    });

  it("uploads exact metadata, reports duplicates and preserves immutable replacement history", async () => {
    const first = await upload("ev-upload-1", undefined, "../../invoice.pdf");
    expect(first.statusCode).toBe(201);
    const firstData = first.json().data;
    expect(firstData.sha256).toBe(createHash("sha256").update(pdf).digest("hex"));
    expect(firstData.duplicates).toEqual([]);
    const replay = await upload("ev-upload-1", undefined, "../../invoice.pdf");
    expect(replay.json().data.idempotencyReplayed).toBe(true);
    const duplicate = await upload("ev-upload-duplicate");
    expect(duplicate.statusCode).toBe(201);
    expect(duplicate.json().data.duplicates).toHaveLength(1);
    const replacement = await upload("ev-upload-2", firstData.evidenceId, "replacement.pdf");
    expect(replacement.statusCode).toBe(201);
    expect(replacement.json().data.versionNumber).toBe(2);
    const history = await app.inject({
      method: "GET",
      url: `/api/v1/organizations/org-evidence/evidence/${firstData.evidenceId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(history.statusCode).toBe(200);
    expect(history.json().data.versions.map((v: { status: string }) => v.status)).toEqual([
      "active",
      "superseded",
    ]);
    const db = await pool.query<{ object_key: string; original_filename: string }>(
      "select object_key,original_filename from evidence_versions where organization_id='org-evidence' and evidence_id=$1 order by version_number",
      [firstData.evidenceId],
    );
    expect(db.rows[0]!.object_key).not.toContain("invoice.pdf");
    expect(db.rows[0]!.original_filename).toBe(".._.._invoice.pdf");
  });

  it("reviews and issues a bounded audited signed download while denying cross-organization access", async () => {
    const created = await upload("ev-sec-create");
    const id = created.json().data.evidenceId as string;
    const reviewed = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/org-evidence/evidence/${id}/review`,
      headers: headers(token, "ev-review"),
      payload: { state: "accepted", reason: "Matched invoice", reference: "review-1" },
    });
    expect(reviewed.statusCode).toBe(201);
    const download = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/org-evidence/evidence/${id}/download-url`,
      headers: headers(token, "ev-download"),
      payload: { reason: "Accountant review", expiresInSeconds: 120 },
    });
    expect(download.statusCode).toBe(201);
    expect(download.json().data.url).toContain("expiresIn=120");
    const audit = await pool.query(
      "select action from evidence_access_events where organization_id='org-evidence' and evidence_id=$1 order by occurred_at",
      [id],
    );
    expect(audit.rows.map((row) => row.action)).toEqual(["upload", "download_url_issued"]);
    const denied = await app.inject({
      method: "GET",
      url: `/api/v1/organizations/org-evidence/evidence/${id}`,
      headers: { authorization: `Bearer ${otherToken}` },
    });
    expect(denied.statusCode).toBe(403);
  });
});
