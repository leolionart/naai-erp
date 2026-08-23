#!/usr/bin/env node

/**
 * Guard the local development database from accidentally accumulating test tenants.
 * Run with DATABASE_URL pointed at the dev database. Production is intentionally excluded.
 */
import { execFileSync } from "node:child_process";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://naai_erp:naai_erp@localhost:5432/naai_erp";
const output = execFileSync(
  "psql",
  [databaseUrl, "-Atc", "select id from organizations order by id"],
  { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
);
const unexpected = output
  .split("\n")
  .map((id) => id.trim())
  .filter((id) => id && id !== "naai");
if (unexpected.length) {
  console.error(`Development database contains ${unexpected.length} non-naai organization(s).`);
  process.exitCode = 1;
} else {
  console.log("Development organization scope verified: naai only.");
}
