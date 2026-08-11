import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");

function fixture() {
  const directory = mkdtempSync(resolve(tmpdir(), "naai-erp-db-maintenance-"));
  const log = resolve(directory, "psql.log");
  const executable = resolve(directory, "psql");
  writeFileSync(executable, `#!/bin/sh\nprintf '%s\\n' "$*" >> "$PSQL_LOG"\nprintf 'ok\\n'\n`);
  chmodSync(executable, 0o755);
  return { directory, log };
}

describe("ERP-906 database maintenance guardrails", () => {
  it("reports storage without issuing a mutating SQL command", () => {
    const { directory, log } = fixture();
    const result = spawnSync("node", ["scripts/database-maintenance.mjs", "report"], {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH}`,
        PSQL_LOG: log,
        DATABASE_URL: "postgresql://user:pass@127.0.0.1/db",
      },
      encoding: "utf8",
    });
    expect(result.status, result.stderr).toBe(0);
    const command = readFileSync(log, "utf8").toLowerCase();
    expect(command).toContain("pg_stat_user_tables");
    expect(command).not.toMatch(/\b(delete|update|truncate|drop|vacuum)\b/);
  });

  it("requires exact confirmation and backup evidence before lock-heavy reclaim", () => {
    const { directory, log } = fixture();
    const base = {
      ...process.env,
      PATH: `${directory}:${process.env.PATH}`,
      PSQL_LOG: log,
      DATABASE_URL: "postgresql://user:pass@127.0.0.1/db",
    };
    const denied = spawnSync(
      "node",
      ["scripts/database-maintenance.mjs", "reclaim", "public.portable_data_imports"],
      { cwd: root, env: base, encoding: "utf8" },
    );
    expect(denied.status).not.toBe(0);

    const allowed = spawnSync(
      "node",
      [
        "scripts/database-maintenance.mjs",
        "reclaim",
        "public.portable_data_imports",
        "VACUUM-FULL:public.portable_data_imports",
      ],
      {
        cwd: root,
        env: { ...base, MAINTENANCE_BACKUP_EVIDENCE: "local-backup-erp906" },
        encoding: "utf8",
      },
    );
    expect(allowed.status, allowed.stderr).toBe(0);
    expect(readFileSync(log, "utf8").toLowerCase()).toContain(
      'vacuum (full, analyze) "public"."portable_data_imports"',
    );
  });
});
