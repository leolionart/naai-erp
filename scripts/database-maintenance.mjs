import { execFileSync } from "node:child_process";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const action = process.argv[2] || "report";

function psql(sql) {
  return execFileSync(
    "psql",
    [databaseUrl, "-X", "-v", "ON_ERROR_STOP=1", "-P", "pager=off", "-At", "-F", "|", "-c", sql],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    },
  );
}

if (action === "report") {
  const sql = `
select 'database',current_database(),pg_size_pretty(pg_database_size(current_database())),pg_database_size(current_database());
select 'relation',relname,pg_size_pretty(pg_total_relation_size(relid)),pg_total_relation_size(relid),n_live_tup,n_dead_tup,coalesce(last_autovacuum::text,'never')
  from pg_stat_user_tables order by pg_total_relation_size(relid) desc limit 30;
select 'export_blob','portable_data_packages',count(*),coalesce(sum(octet_length(content)),0),count(*) filter(where content is null)
  from portable_data_packages;
select 'export_blob','accountant_exports',count(*),coalesce(sum(octet_length(content)),0),count(*) filter(where content is null)
  from accountant_exports;`;
  process.stdout.write(psql(sql));
} else if (action === "reclaim") {
  const relation = process.argv[3] || "";
  const confirmation = process.argv[4] || "";
  const backupEvidence = process.env.MAINTENANCE_BACKUP_EVIDENCE?.trim();
  if (!/^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/i.test(relation))
    throw new Error("A validated schema.table relation is required.");
  if (confirmation !== `VACUUM-FULL:${relation}`)
    throw new Error(`Reclaim requires exact confirmation VACUUM-FULL:${relation}.`);
  if (!backupEvidence) throw new Error("MAINTENANCE_BACKUP_EVIDENCE is required.");

  const url = new URL(databaseUrl);
  const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (!local && process.env.MAINTENANCE_ALLOW_REMOTE !== "1")
    throw new Error("Remote reclaim requires MAINTENANCE_ALLOW_REMOTE=1.");

  const [schema, table] = relation.split(".");
  const quoted = `"${schema}"."${table}"`;
  process.stderr.write(
    `Running lock-heavy VACUUM FULL for ${relation}; backup evidence: ${backupEvidence}\n`,
  );
  process.stdout.write(psql(`vacuum (full, analyze) ${quoted};`));
} else {
  throw new Error(`Unknown database maintenance action: ${action}`);
}
