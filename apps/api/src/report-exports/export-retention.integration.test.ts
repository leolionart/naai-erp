import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pruneGeneratedExportContentInTransaction } from "./export-retention.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration("ERP-906 organization-scoped generated export retention", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  let client: pg.PoolClient;

  beforeAll(async () => {
    client = await pool.connect();
    await client.query("begin");
    await client.query(`
      insert into organizations(id,legal_name,base_currency,timezone)
      values ('org-erp906-retention','ERP 906 Retention','VND','Asia/Ho_Chi_Minh'),
             ('org-erp906-other','ERP 906 Other','VND','Asia/Ho_Chi_Minh');
      insert into report_snapshots
        (organization_id,id,version,report_kind,readiness,period_starts_on,period_ends_on,
         accounting_basis,currency,canonical_request,request_hash,canonical_result,result_hash,
         formula_versions,mapping_versions,ledger_cutoff,source_manifest,source_fingerprint,
         readiness_summary,captured_by)
      values
        ('org-erp906-retention','snap',1,'profit_and_loss','final','2026-01-01','2026-01-31',
         'accrual','VND','{}','request-906','{}','result-906','{}','{}','{}','[]','source-906','{}','fixture'),
        ('org-erp906-other','snap',1,'profit_and_loss','final','2026-01-01','2026-01-31',
         'accrual','VND','{}','request-other-906','{}','result-other-906','{}','{}','{}','[]','source-other-906','{}','fixture');
      insert into journal_entries(organization_id,id,journal_date,description,currency,state)
      values ('org-erp906-retention','journal-906','2026-01-01','Must survive retention','VND','draft');
    `);
    for (const organizationId of ["org-erp906-retention", "org-erp906-other"]) {
      for (let index = 1; index <= 7; index += 1) {
        await client.query(
          `insert into accountant_exports
           (organization_id,id,version,snapshot_id,snapshot_version,format,label,manifest,content,
            content_hash,size_bytes,media_type,filename,generated_by,generated_at)
           values ($1,$2,1,'snap',1,'xlsx',$2,'{"workbookHash":"hash","isFinal":true}',
                   decode('01','hex'),$2,1,'application/test',$2,'fixture',
                   '2026-08-01T00:00:00Z'::timestamptz + ($3 || ' hours')::interval)`,
          [organizationId, `export-${index}`, index],
        );
        await client.query(
          `insert into portable_data_packages
           (organization_id,id,schema_version,as_of,format,manifest,schemas,content,content_hash,
            package_hash,size_bytes,media_type,filename,idempotency_key,request_hash,generated_by,
            correlation_id,generated_at)
           values ($1,$2,1,'2026-08-01','xlsx','{}','[]',decode('01','hex'),$2,$3,1,
                   'application/test',$2,$2,$3,'fixture','fixture',
                   '2026-08-01T00:00:00Z'::timestamptz + ($4 || ' hours')::interval)`,
          [organizationId, `package-${index}`, `package-hash-${organizationId}-${index}`, index],
        );
      }
    }
  });

  afterAll(async () => {
    await client.query("rollback");
    client.release();
    await pool.end();
  });

  it("keeps the newest five blobs, preserves metadata and never crosses organizations", async () => {
    await expect(
      pruneGeneratedExportContentInTransaction(client, "org-erp906-retention", {
        keepLatest: 5,
        maxAgeDays: 3_650,
      }),
    ).resolves.toEqual({ accountantExportBlobsPruned: 2, portablePackageBlobsPruned: 2 });

    const retained = await client.query(`
      select
        (select count(*)::int from accountant_exports where organization_id='org-erp906-retention') accountant_rows,
        (select count(*)::int from accountant_exports where organization_id='org-erp906-retention' and content is not null) accountant_blobs,
        (select count(*)::int from portable_data_packages where organization_id='org-erp906-retention') package_rows,
        (select count(*)::int from portable_data_packages where organization_id='org-erp906-retention' and content is not null) package_blobs,
        (select count(*)::int from accountant_exports where organization_id='org-erp906-other' and content is not null) other_accountant_blobs,
        (select count(*)::int from portable_data_packages where organization_id='org-erp906-other' and content is not null) other_package_blobs,
        (select count(*)::int from journal_entries where organization_id='org-erp906-retention' and id='journal-906') journals
    `);
    expect(retained.rows[0]).toEqual({
      accountant_rows: 7,
      accountant_blobs: 5,
      package_rows: 7,
      package_blobs: 5,
      other_accountant_blobs: 7,
      other_package_blobs: 7,
      journals: 1,
    });

    await expect(
      pruneGeneratedExportContentInTransaction(client, "org-erp906-retention", {
        keepLatest: 5,
        maxAgeDays: 3_650,
      }),
    ).resolves.toEqual({ accountantExportBlobsPruned: 0, portablePackageBlobsPruned: 0 });
  });
});
