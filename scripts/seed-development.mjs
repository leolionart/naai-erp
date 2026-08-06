import { createRequire } from "node:module";

if (process.env.ALLOW_DEVELOPMENT_SEED !== "true") {
  throw new Error("Development seed is disabled. Set ALLOW_DEVELOPMENT_SEED=true explicitly.");
}
if (process.env.NODE_ENV === "production") {
  throw new Error("Synthetic development seed is forbidden in production.");
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for development seed.");

const requireDatabaseDependency = createRequire(
  new URL("../packages/database/package.json", import.meta.url),
);
const pg = requireDatabaseDependency("pg");
const { seedTt133Mvp } = await import("../db/seed/tt133-mvp.mjs");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const result = await seedTt133Mvp(pool, {
    organizationId: process.env.MVP_SEED_ORGANIZATION_ID ?? "org-demo",
    legalName: process.env.MVP_SEED_LEGAL_NAME ?? "NAAI ERP Synthetic Demo",
    fiscalYear: process.env.MVP_SEED_FISCAL_YEAR
      ? Number(process.env.MVP_SEED_FISCAL_YEAR)
      : new Date().getUTCFullYear(),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  await pool.end();
}

process.stdout.write(
  "Synthetic TT133 MVP development seed completed. Production is never automatically seeded.\n",
);
