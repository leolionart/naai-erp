import type { Pool, PoolClient } from "pg";

export type ExportRetentionPolicy = Readonly<{
  keepLatest: number;
  maxAgeDays: number;
}>;

export type ExportRetentionResult = Readonly<{
  accountantExportBlobsPruned: number;
  portablePackageBlobsPruned: number;
}>;

export const DEFAULT_EXPORT_RETENTION_POLICY: ExportRetentionPolicy = {
  keepLatest: 5,
  maxAgeDays: 30,
};

const boundedPositiveInteger = (value: string | undefined, fallback: number, maximum: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= maximum ? parsed : fallback;
};

export const exportRetentionPolicyFromEnv = (
  env: NodeJS.ProcessEnv = process.env,
): ExportRetentionPolicy => ({
  keepLatest: boundedPositiveInteger(
    env.EXPORT_RETENTION_KEEP_LATEST,
    DEFAULT_EXPORT_RETENTION_POLICY.keepLatest,
    100,
  ),
  maxAgeDays: boundedPositiveInteger(
    env.EXPORT_RETENTION_MAX_AGE_DAYS,
    DEFAULT_EXPORT_RETENTION_POLICY.maxAgeDays,
    3_650,
  ),
});

export async function pruneGeneratedExportContent(
  pool: Pool,
  organizationId: string,
  policy: ExportRetentionPolicy = exportRetentionPolicyFromEnv(),
): Promise<ExportRetentionResult> {
  if (!organizationId.trim()) throw new Error("ORGANIZATION_ID_REQUIRED");
  if (!Number.isInteger(policy.keepLatest) || policy.keepLatest < 1)
    throw new Error("INVALID_EXPORT_RETENTION_POLICY");
  if (!Number.isInteger(policy.maxAgeDays) || policy.maxAgeDays < 1)
    throw new Error("INVALID_EXPORT_RETENTION_POLICY");

  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `${organizationId}:generated-export-retention`,
    ]);
    const result = await pruneGeneratedExportContentInTransaction(client, organizationId, policy);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function pruneGeneratedExportContentInTransaction(
  client: Pick<PoolClient, "query">,
  organizationId: string,
  policy: ExportRetentionPolicy,
): Promise<ExportRetentionResult> {
  const accountant = await client.query(
    `with ranked as (
         select organization_id,id,version,generated_at,
                row_number() over(order by generated_at desc,id desc,version desc) position
         from accountant_exports
         where organization_id=$1 and content is not null
       )
       update accountant_exports target
          set content=null,content_pruned_at=now()
         from ranked candidate
        where target.organization_id=candidate.organization_id
          and target.id=candidate.id and target.version=candidate.version
          and (candidate.position > $2 or
               (candidate.position > 1 and candidate.generated_at < now() - ($3::text || ' days')::interval))`,
    [organizationId, policy.keepLatest, policy.maxAgeDays],
  );
  const portable = await client.query(
    `with ranked as (
         select organization_id,id,generated_at,
                row_number() over(order by generated_at desc,id desc) position
         from portable_data_packages
         where organization_id=$1 and content is not null
       )
       update portable_data_packages target
          set content=null,content_pruned_at=now()
         from ranked candidate
        where target.organization_id=candidate.organization_id and target.id=candidate.id
          and (candidate.position > $2 or
               (candidate.position > 1 and candidate.generated_at < now() - ($3::text || ' days')::interval))`,
    [organizationId, policy.keepLatest, policy.maxAgeDays],
  );
  return {
    accountantExportBlobsPruned: accountant.rowCount ?? 0,
    portablePackageBlobsPruned: portable.rowCount ?? 0,
  };
}
