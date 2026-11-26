import pg from "pg";
import { describe, expect, it } from "vitest";
import {
  migrationsFolder,
  runPendingMigrations,
  shouldMigrateOnStart,
} from "./migrate-on-start.js";

describe("migrate on start", () => {
  it("is enabled only with a database and without the opt-out", () => {
    expect(shouldMigrateOnStart({})).toBe(false);
    expect(shouldMigrateOnStart({ DATABASE_URL: "postgresql://x" })).toBe(true);
    expect(shouldMigrateOnStart({ DATABASE_URL: "postgresql://x", MIGRATE_ON_START: "0" })).toBe(
      false,
    );
  });

  it("resolves the repository migrations folder unless overridden", () => {
    expect(migrationsFolder({})).toMatch(/db\/migrations$/);
    expect(migrationsFolder({ MIGRATIONS_FOLDER: "/custom" })).toBe("/custom");
  });
});

const url =
  process.env.RUN_DB_INTEGRATION === "1" ? process.env.MIGRATE_TEST_DATABASE_URL : undefined;
describe.skipIf(!url)("migrate on start against an empty database", () => {
  it("creates the schema, is idempotent and serializes concurrent starts", async () => {
    const environment = { DATABASE_URL: url! };
    await Promise.all([runPendingMigrations(environment), runPendingMigrations(environment)]);
    await runPendingMigrations(environment);
    const pool = new pg.Pool({ connectionString: url });
    try {
      const result = await pool.query(
        `select to_regclass('telegram_settings') settings,
                (select count(*)::int from drizzle.__drizzle_migrations) applied`,
      );
      expect(result.rows[0].settings).toBe("telegram_settings");
      expect(result.rows[0].applied).toBeGreaterThanOrEqual(70);

      // Simulate a database deployed before the Telegram migrations: only those are re-applied.
      await pool.query(
        `drop table telegram_notifications; drop table telegram_settings;
         delete from drizzle.__drizzle_migrations where id in
           (select id from drizzle.__drizzle_migrations order by id desc limit 2)`,
      );
      await runPendingMigrations(environment);
      const restored = await pool.query(
        "select to_regclass('telegram_settings') a, to_regclass('telegram_notifications') b",
      );
      expect(restored.rows[0]).toEqual({ a: "telegram_settings", b: "telegram_notifications" });
    } finally {
      await pool.end();
    }
  });
});
