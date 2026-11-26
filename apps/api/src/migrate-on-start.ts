import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

type MigrateEnvironment = Readonly<{
  DATABASE_URL?: string;
  MIGRATE_ON_START?: string;
  MIGRATIONS_FOLDER?: string;
}>;

const LOCK_KEY = "naai-erp:schema-migrations";

/**
 * Applies pending forward migrations before the API serves traffic. The standalone `migrate`
 * container runs once per stack start, so an image watcher that only recreates api/web/worker
 * would otherwise leave the schema behind (e.g. `relation "telegram_settings" does not exist`).
 *
 * Safe to run concurrently with other replicas or the migrate job: an advisory lock serializes
 * runs and drizzle skips migrations that are already recorded. Disable with MIGRATE_ON_START=0.
 */
export function migrationsFolder(environment: MigrateEnvironment = process.env) {
  // dist/main.js and src/main.ts both resolve to <root>/db/migrations (/db/migrations in the image).
  return (
    environment.MIGRATIONS_FOLDER?.trim() ||
    fileURLToPath(new URL("../../../db/migrations", import.meta.url))
  );
}

export function shouldMigrateOnStart(environment: MigrateEnvironment = process.env) {
  return Boolean(environment.DATABASE_URL) && environment.MIGRATE_ON_START?.trim() !== "0";
}

export async function runPendingMigrations(environment: MigrateEnvironment = process.env) {
  const client = new pg.Client({ connectionString: environment.DATABASE_URL });
  await client.connect();
  try {
    await client.query("select pg_advisory_lock(hashtextextended($1,0))", [LOCK_KEY]);
    await migrate(drizzle(client), { migrationsFolder: migrationsFolder(environment) });
  } finally {
    await client
      .query("select pg_advisory_unlock(hashtextextended($1,0))", [LOCK_KEY])
      .catch(() => undefined);
    await client.end();
  }
}
