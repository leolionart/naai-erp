import { createHash } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration("ERP-851 local organization reset", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const organizationId = `org-erp851-reset-${process.pid}`;
  const token = `erp851-reset-owner-${process.pid}`;
  const packageId = "erp851-full-backup";
  const content = Buffer.from("complete portable workbook fixture");
  const workbookSha256 = createHash("sha256").update(content).digest("hex");
  let app: Awaited<ReturnType<typeof createApp>>;
  const headers = (key: string) => ({
    authorization: `Bearer ${token}`,
    "idempotency-key": key,
    "x-correlation-id": `corr-${key}`,
    host: "127.0.0.1:3001",
  });

  beforeAll(async () => {
    process.env.NAAI_ERP_LOCAL_RESET_ENABLED = "1";
    await pool.query(`
      insert into organizations(id,legal_name,base_currency,timezone)
      values ('${organizationId}','ERP 851 reset','VND','Asia/Ho_Chi_Minh');
      insert into api_credentials(organization_id,id,actor_id,token_hash,roles)
      values ('${organizationId}','cred-851','owner-851','${createHash("sha256").update(token).digest("hex")}', '["owner"]');
      insert into accounts(organization_id,code,name,root_type,is_control_account,allow_manual_posting)
      values ('${organizationId}','111','Baseline cash','asset',false,true);
      insert into parties(organization_id,id,display_name,status)
      values ('${organizationId}','demo-party-851','Demo party','active');
      insert into journal_entries(organization_id,id,journal_date,description,currency,state,version,created_by,approved_at,approved_by,approval_reason,posted_at,posted_by)
      values ('${organizationId}','demo-journal-851','2026-08-01','Immutable demo','VND','posted',2,'owner-851',now(),'owner-851','Fixture',now(),'owner-851');
      insert into journal_lines(organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions)
      values ('${organizationId}','demo-journal-851',1,'111',1,null,'Debit','{}'),
             ('${organizationId}','demo-journal-851',2,'111',null,1,'Credit','{}');
      insert into portable_data_packages
        (organization_id,id,schema_version,as_of,format,manifest,schemas,content,content_hash,package_hash,size_bytes,media_type,filename,idempotency_key,request_hash,generated_by,correlation_id)
      values ('${organizationId}','${packageId}',1,'2026-08-08','xlsx',
        '${JSON.stringify({
          schemaVersion: 1,
          packageId,
          organizationId,
          exportedAt: "2026-08-08T00:00:00.000Z",
          asOf: "2026-08-08",
          exportedBy: "owner-851",
          sourceSystem: "naai-erp",
          sourceApiVersion: "v1",
          hashAlgorithm: "sha256",
          workbookSha256,
          sheets: [
            {
              resourceType: "parties",
              excluded: false,
              schemaVersion: 1,
              dependencyOrder: 1,
              mutability: "editable",
              rowCount: 1,
            },
            {
              resourceType: "secrets",
              excluded: true,
              exclusionReason: "Sensitive runtime data",
              schemaVersion: 1,
              dependencyOrder: 2,
              mutability: "read_only",
              rowCount: 0,
            },
          ],
          totalSheetCount: 1,
          totalRowCount: 1,
          packageHash: "package-hash-851",
        }).replaceAll("'", "''")}',
        '[]',decode('${content.toString("hex")}','hex'),'${workbookSha256}','package-hash-851',${content.length},
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','backup.xlsx','export-851','request-851','owner-851','corr-export-851');
    `);
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await pool.query("drop table if exists zzz_erp851_reset_failure cascade");
    await pool.query("delete from resource_audit_events where organization_id=$1", [
      organizationId,
    ]);
    await pool.query("delete from api_idempotency_records where organization_id=$1", [
      organizationId,
    ]);
    await pool.query("delete from portable_data_packages where organization_id=$1", [
      organizationId,
    ]);
    await pool.query("delete from accounts where organization_id=$1", [organizationId]);
    await pool.query("delete from api_credentials where organization_id=$1", [organizationId]);
    await pool.query("delete from organizations where id=$1", [organizationId]);
    await app?.close();
    await pool.end();
    delete process.env.NAAI_ERP_LOCAL_RESET_ENABLED;
  });

  it("rejects checksum mismatch without deleting any rows", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${organizationId}/portable-data-packages/local-admin/reset`,
      headers: headers("reset-bad-sha"),
      payload: {
        confirmOrganizationId: organizationId,
        packageId,
        workbookSha256: "0".repeat(64),
      },
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(
      (
        await pool.query("select count(*)::int n from parties where organization_id=$1", [
          organizationId,
        ])
      ).rows[0].n,
    ).toBe(1);
  });

  it("rolls back all prior deletes when a schema-discovered table fails", async () => {
    await pool.query(`
      create table zzz_erp851_reset_failure(organization_id text not null, id text not null);
      insert into zzz_erp851_reset_failure values ('${organizationId}','fail');
      create rule erp851_always_fail as on delete to zzz_erp851_reset_failure
      do instead select 1/0;
    `);
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${organizationId}/portable-data-packages/local-admin/reset`,
      headers: headers("reset-rollback"),
      payload: { confirmOrganizationId: organizationId, packageId, workbookSha256 },
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(
      (
        await pool.query("select count(*)::int n from parties where organization_id=$1", [
          organizationId,
        ])
      ).rows[0].n,
    ).toBe(1);
    await pool.query("drop table zzz_erp851_reset_failure cascade");
  });

  it("deletes business data while preserving identity, credentials, backup, and baseline config", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${organizationId}/portable-data-packages/local-admin/reset`,
      headers: headers("reset-success"),
      payload: { confirmOrganizationId: organizationId, packageId, workbookSha256 },
    });
    expect(response.statusCode, response.body).toBe(201);
    expect(response.json().data).toMatchObject({
      organizationId,
      packageId,
      workbookSha256,
      idempotencyReplayed: false,
    });
    const counts = await pool.query(
      `select
        (select count(*) from organizations where id=$1)::int organizations,
        (select count(*) from api_credentials where organization_id=$1)::int credentials,
        (select count(*) from portable_data_packages where organization_id=$1 and id=$2)::int packages,
        (select count(*) from accounts where organization_id=$1)::int accounts,
        (select count(*) from parties where organization_id=$1)::int parties,
        (select count(*) from journal_entries where organization_id=$1)::int journals,
        (select count(*) from resource_audit_events where organization_id=$1 and action='local_reset')::int resets`,
      [organizationId, packageId],
    );
    expect(counts.rows[0]).toEqual({
      organizations: 1,
      credentials: 1,
      packages: 1,
      accounts: 1,
      parties: 0,
      journals: 0,
      resets: 1,
    });
  });
});
