#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Helper to check if file is run directly
export function isMain() {
  if (!process.argv[1]) return false;
  try {
    const mainPath = realpathSync(process.argv[1]);
    const scriptPath = fileURLToPath(import.meta.url);
    return mainPath === scriptPath;
  } catch {
    return false;
  }
}

// Never silently load secrets from .env
export function loadEnv(envPath, envObj = process.env) {
  if (existsSync(envPath)) {
    console.log(`Loading environment variables from .env file: ${envPath.pathname || envPath}`);
    const envContent = readFileSync(envPath, "utf-8");
    const loadedKeys = [];
    for (const line of envContent.split("\n")) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let val = match[2] || "";
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        else if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
        if (envObj[key] === undefined) {
          envObj[key] = val;
          loadedKeys.push(key);
        }
      }
    }
    if (loadedKeys.length > 0) {
      console.log(`Loaded keys from .env: ${loadedKeys.join(", ")}`);
    }
  }
}

const requireDb = createRequire(new URL("../packages/database/package.json", import.meta.url));
let defaultPg;
try {
  defaultPg = requireDb("pg");
} catch {
  // Ignored for environments where pg is not installed or when mock is passed
}

export function validateIdentifier(name) {
  if (typeof name !== "string") return false;
  return /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(name);
}

export function redact(str, config = {}) {
  if (typeof str !== "string") return str;
  let redacted = str;

  // 1. Redact connection strings: postgresql://username:password@host:port/database
  redacted = redacted.replace(/:[^:@\s]+@/g, ":[REDACTED]@");

  // 2. Redact exact password
  if (config.dbPassword && config.dbPassword.length > 0) {
    const escaped = config.dbPassword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    redacted = redacted.replace(new RegExp(escaped, "g"), "[REDACTED]");

    const encoded = encodeURIComponent(config.dbPassword).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (encoded !== escaped) {
      redacted = redacted.replace(new RegExp(encoded, "g"), "[REDACTED]");
    }
  }

  // 3. Redact exact token
  if (config.token && config.token.length > 0) {
    const escaped = config.token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    redacted = redacted.replace(new RegExp(escaped, "g"), "[REDACTED]");

    const encoded = encodeURIComponent(config.token).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (encoded !== escaped) {
      redacted = redacted.replace(new RegExp(encoded, "g"), "[REDACTED]");
    }
  }

  return redacted;
}

export function safeExecFile(execFile, file, args, options = {}, config = {}) {
  try {
    return execFile(file, args, options);
  } catch (err) {
    const redactedMsg = redact(err.message || String(err), config);
    const newErr = new Error(redactedMsg);
    if (err.stack) {
      newErr.stack = redact(err.stack, config);
    }
    if (err.stdout) {
      newErr.stdout = typeof err.stdout === "string" ? redact(err.stdout, config) : err.stdout;
    }
    if (err.stderr) {
      newErr.stderr = typeof err.stderr === "string" ? redact(err.stderr, config) : err.stderr;
    }
    throw newErr;
  }
}

export function getPgConfigPath(execFile = execFileSync) {
  try {
    const path = safeExecFile(execFile, "which", ["pg_config"], { stdio: "pipe" })
      .toString()
      .trim();
    if (path) return path;
  } catch {
    void 0;
  }

  const appleSiliconPath = "/opt/homebrew/opt/postgresql@16/bin/pg_config";
  if (existsSync(appleSiliconPath)) return appleSiliconPath;

  const intelPath = "/usr/local/opt/postgresql@16/bin/pg_config";
  if (existsSync(intelPath)) return intelPath;

  return null;
}

export function getPgBinary(name, execFile = execFileSync) {
  const pgConfig = getPgConfigPath(execFile);
  if (pgConfig) {
    const binDir = pgConfig.substring(0, pgConfig.lastIndexOf("/"));
    const path = `${binDir}/${name}`;
    if (existsSync(path)) return path;
  }
  return name;
}

export async function checkPostgres(execFile = execFileSync) {
  const pgConfig = getPgConfigPath(execFile);
  const pgIsReadyBin = getPgBinary("pg_isready", execFile);

  if (!pgConfig) {
    return { installed: false, running: false, version: null };
  }
  let version = null;
  try {
    version = safeExecFile(execFile, pgConfig, ["--version"]).toString().trim();
  } catch {
    void 0;
  }

  let running = false;
  try {
    safeExecFile(execFile, pgIsReadyBin, ["-h", "localhost", "-p", "5432"], { stdio: "pipe" });
    running = true;
  } catch {
    void 0;
  }

  return { installed: true, running, version };
}

export function getConfig(env = process.env) {
  return {
    dbRole: env.NAAI_DB_ROLE || "naai_erp",
    dbPassword: env.NAAI_DB_PASSWORD || "naai_erp",
    dbName: env.NAAI_DB_NAME || "naai_erp",
    orgId: env.NAAI_ORG_ID || "naai",
    credentialId: env.NAAI_CREDENTIAL_ID || "local-owner-cred-id",
    actorId: env.NAAI_ACTOR_ID || "local-owner-actor",
    token: env.NAAI_ERP_TOKEN,
  };
}

export function getAction(argv = process.argv) {
  return argv[2] === "status" ? "status" : "setup";
}

export async function runSetup(env = process.env, overrides = {}) {
  console.log("=== Starting NAAI ERP Native Database Setup ===");
  const config = getConfig(env);
  const execFile = overrides.execFile || overrides.exec || execFileSync;
  const pgLib = overrides.pg || defaultPg;

  if (!validateIdentifier(config.dbRole)) {
    return { success: false, error: `Invalid database role identifier: "${config.dbRole}"` };
  }
  if (!validateIdentifier(config.dbName)) {
    return { success: false, error: `Invalid database name identifier: "${config.dbName}"` };
  }

  // 1. Detect Homebrew PostgreSQL 16
  const pgStatus = await checkPostgres(execFile);
  if (!pgStatus.installed || !pgStatus.version?.includes(" 16.")) {
    console.error("Error: Homebrew PostgreSQL 16 is not detected.");
    console.error("Detected version: " + (pgStatus.version || "None"));
    console.error("Please install it using: brew install postgresql@16");
    return { success: false, error: "PostgreSQL 16 not detected" };
  }
  console.log(`Detected: ${pgStatus.version}`);

  const pgIsReadyBin = getPgBinary("pg_isready", execFile);

  // 2. Start/check localhost 5432 without exposing secrets
  if (!pgStatus.running) {
    console.log("PostgreSQL is not running on localhost:5432. Starting via Homebrew...");
    try {
      safeExecFile(
        execFile,
        "brew",
        ["services", "start", "postgresql@16"],
        { stdio: "inherit" },
        config,
      );
    } catch {
      console.warn("Failed to run 'brew services start postgresql@16'. Continuing to check...");
    }

    // Wait and check if ready
    let ready = false;
    for (let i = 0; i < 10; i++) {
      try {
        safeExecFile(execFile, pgIsReadyBin, ["-h", "localhost", "-p", "5432"], { stdio: "pipe" });
        ready = true;
        break;
      } catch {
        void 0;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    if (!ready) {
      console.error(
        "Error: PostgreSQL on localhost:5432 is not accepting connections after starting attempt.",
      );
      return { success: false, error: "PostgreSQL not running" };
    }
  }
  console.log("PostgreSQL on localhost:5432 is running and accepting connections.");

  const psqlBin = getPgBinary("psql", execFile);

  // 3. Create role/database idempotently
  console.log("Configuring role and database idempotently...");
  try {
    const roleSql = `SELECT 1 FROM pg_roles WHERE rolname='${config.dbRole.replace(/'/g, "''")}';`;
    const roleCheck = safeExecFile(
      execFile,
      psqlBin,
      ["-d", "postgres", "-tA", "-c", roleSql],
      { stdio: ["pipe", "pipe", "pipe"] },
      config,
    )
      .toString()
      .trim();
    if (roleCheck !== "1") {
      console.log(`Creating role '${config.dbRole}'...`);
      const createRoleSql = `CREATE ROLE ${config.dbRole} WITH LOGIN PASSWORD '${config.dbPassword.replace(/'/g, "''")}';`;
      safeExecFile(
        execFile,
        psqlBin,
        ["-d", "postgres"],
        { input: createRoleSql, stdio: ["pipe", "pipe", "pipe"] },
        config,
      );

      const alterRoleSql = `ALTER ROLE ${config.dbRole} CREATEDB;`;
      safeExecFile(
        execFile,
        psqlBin,
        ["-d", "postgres"],
        { input: alterRoleSql, stdio: ["pipe", "pipe", "pipe"] },
        config,
      );
    } else {
      console.log(`Role '${config.dbRole}' already exists.`);
    }

    const dbSql = `SELECT 1 FROM pg_database WHERE datname='${config.dbName.replace(/'/g, "''")}';`;
    const dbCheck = safeExecFile(
      execFile,
      psqlBin,
      ["-d", "postgres", "-tA", "-c", dbSql],
      { stdio: ["pipe", "pipe", "pipe"] },
      config,
    )
      .toString()
      .trim();
    if (dbCheck !== "1") {
      console.log(`Creating database '${config.dbName}'...`);
      const createDbSql = `CREATE DATABASE ${config.dbName} OWNER ${config.dbRole};`;
      safeExecFile(
        execFile,
        psqlBin,
        ["-d", "postgres"],
        { input: createDbSql, stdio: ["pipe", "pipe", "pipe"] },
        config,
      );
    } else {
      console.log(`Database '${config.dbName}' already exists.`);
    }
  } catch (err) {
    const msg = redact(err.message || String(err), config);
    console.error("Error configuring role/database using psql:", msg);
    return { success: false, error: msg };
  }

  const connStr = `postgresql://${config.dbRole}:${encodeURIComponent(config.dbPassword)}@localhost:5432/${config.dbName}`;

  // 3.5 Preflight token or existing credential before migration/seed
  if (!pgLib) {
    console.error("Error: pg module dependency not found.");
    return { success: false, error: "pg dependency missing" };
  }

  const token = config.token;
  let preflightOk = false;
  if (token) {
    preflightOk = true;
  } else {
    const preflightPool = new pgLib.Pool({ connectionString: connStr });
    try {
      const tableCheck = await preflightPool.query(
        "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'api_credentials'",
      );
      if (tableCheck.rowCount > 0) {
        const credCheck = await preflightPool.query(
          "SELECT 1 FROM api_credentials WHERE organization_id = $1 AND id = $2 AND status = 'active'",
          [config.orgId, config.credentialId],
        );
        if (credCheck.rowCount > 0) {
          preflightOk = true;
        }
      }
    } catch {
      preflightOk = false;
    } finally {
      await preflightPool.end().catch(() => {});
    }
  }

  if (!preflightOk) {
    console.error("\nError: NAAI_ERP_TOKEN is not defined in environment or .env file.");
    console.error(
      "Please set it in your .env or environment to generate the owner API credential.",
    );
    console.error("Example: export NAAI_ERP_TOKEN=some-secure-token\n");
    return { success: false, error: "Missing NAAI_ERP_TOKEN" };
  }

  // 4. Run migrations
  console.log("Running migrations...");
  try {
    safeExecFile(
      execFile,
      "pnpm",
      ["--filter", "@naai-erp/database", "db:migrate"],
      {
        env: { ...env, DATABASE_URL: connStr },
        stdio: "inherit",
      },
      config,
    );
  } catch (err) {
    const msg = redact(err.message || String(err), config);
    console.error("Migration execution failed:", msg);
    return { success: false, error: msg };
  }

  // 5. Seed TT133 for 2025 and 2026
  console.log("Seeding TT133 for 2025 and 2026...");
  const pool = new pgLib.Pool({ connectionString: connStr });
  try {
    const { seedTt133Mvp } = overrides.seedTt133Mvp
      ? { seedTt133Mvp: overrides.seedTt133Mvp }
      : await import("../db/seed/tt133-mvp.mjs");

    const legalName = env.MVP_SEED_LEGAL_NAME ?? "NAAI ERP Synthetic Demo";

    const client = await pool.connect();
    try {
      await seedTt133Mvp(client, { organizationId: config.orgId, legalName, fiscalYear: 2025 });
      console.log("Seeded TT133 for fiscal year 2025.");

      await seedTt133Mvp(client, { organizationId: config.orgId, legalName, fiscalYear: 2026 });
      console.log("Seeded TT133 for fiscal year 2026.");

      console.log("Idempotently ensuring actor user and organization membership exist...");
      const actorEmail = env.NAAI_ACTOR_EMAIL || `${config.actorId}@example.com`;
      const actorName = env.NAAI_ACTOR_NAME || "Local Owner";

      await client.query(
        "INSERT INTO users (id, email, display_name) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING",
        [config.actorId, actorEmail, actorName],
      );
      await client.query(
        "INSERT INTO organization_memberships (organization_id, user_id) VALUES ($1, $2) ON CONFLICT (organization_id, user_id) DO NOTHING",
        [config.orgId, config.actorId],
      );
      await client.query(
        "INSERT INTO membership_roles (organization_id, user_id, role) VALUES ($1, $2, 'owner') ON CONFLICT (organization_id, user_id, role) DO NOTHING",
        [config.orgId, config.actorId],
      );
      console.log("Actor user and organization membership configured successfully.");
    } finally {
      client.release();
    }
  } catch (err) {
    const msg = redact(err.message || String(err), config);
    console.error("Seeding failed:", msg);
    await pool.end().catch(() => {});
    return { success: false, error: msg };
  } finally {
    await pool.end().catch(() => {});
  }

  // 6. Create/update local owner API credential
  if (token) {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const client = new pgLib.Client({ connectionString: connStr });
    try {
      await client.connect();
      await client.query(
        `INSERT INTO api_credentials (organization_id, id, actor_id, token_hash, roles, status)
         VALUES ($1, $2, $3, $4, '["owner"]', 'active')
         ON CONFLICT (organization_id, id) DO UPDATE SET
           token_hash = EXCLUDED.token_hash,
           roles = EXCLUDED.roles,
           status = 'active'`,
        [config.orgId, config.credentialId, config.actorId, tokenHash],
      );
      console.log("Local owner API credential configured successfully.");
    } catch (err) {
      const msg = redact(err.message || String(err), config);
      console.error("Failed to insert API credential:", msg);
      await client.end().catch(() => {});
      return { success: false, error: msg };
    } finally {
      await client.end().catch(() => {});
    }
  } else {
    console.log("Preserving existing local owner API credential (no new NAAI_ERP_TOKEN provided).");
  }

  console.log("\nSetup completed successfully!");
  return { success: true };
}

export async function runStatus(env = process.env, overrides = {}) {
  console.log("=== NAAI ERP Database Status ===");
  const config = getConfig(env);
  const execFile = overrides.execFile || overrides.exec || execFileSync;
  const pgLib = overrides.pg || defaultPg;

  if (!validateIdentifier(config.dbRole)) {
    return { success: false, error: `Invalid database role identifier: "${config.dbRole}"` };
  }
  if (!validateIdentifier(config.dbName)) {
    return { success: false, error: `Invalid database name identifier: "${config.dbName}"` };
  }

  // 1. Check PostgreSQL Installation & Running Status
  const pgStatus = await checkPostgres(execFile);
  console.log(`PostgreSQL 16 Installed: ${pgStatus.installed ? "Yes" : "No"}`);
  if (pgStatus.installed) {
    console.log(`PostgreSQL Version:     ${pgStatus.version}`);
  }
  console.log(`PostgreSQL Running:     ${pgStatus.running ? "Yes" : "No"}`);

  if (!pgStatus.running) {
    console.log(
      "Status: PostgreSQL is offline. Run 'pnpm db:native-setup' to start and configure.",
    );
    return { success: false, error: "PostgreSQL is offline" };
  }

  const psqlBin = getPgBinary("psql", execFile);

  // 2. Check Database & Role
  let roleExists = false;
  let dbExists = false;
  try {
    const roleSql = `SELECT 1 FROM pg_roles WHERE rolname='${config.dbRole.replace(/'/g, "''")}';`;
    const roleCheck = safeExecFile(
      execFile,
      psqlBin,
      ["-d", "postgres", "-tA", "-c", roleSql],
      { stdio: ["pipe", "pipe", "pipe"] },
      config,
    )
      .toString()
      .trim();
    roleExists = roleCheck === "1";

    const dbSql = `SELECT 1 FROM pg_database WHERE datname='${config.dbName.replace(/'/g, "''")}';`;
    const dbCheck = safeExecFile(
      execFile,
      psqlBin,
      ["-d", "postgres", "-tA", "-c", dbSql],
      { stdio: ["pipe", "pipe", "pipe"] },
      config,
    )
      .toString()
      .trim();
    dbExists = dbCheck === "1";
  } catch (err) {
    const msg = redact(err.message || String(err), config);
    console.error("Error checking database and role:", msg);
    return { success: false, error: `Database/role check failed: ${msg}` };
  }

  console.log(`Role '${config.dbRole}' Exists:   ${roleExists ? "Yes" : "No"}`);
  console.log(`DB '${config.dbName}' Exists:     ${dbExists ? "Yes" : "No"}`);

  if (!roleExists) {
    return { success: false, error: `Role '${config.dbRole}' does not exist` };
  }
  if (!dbExists) {
    return { success: false, error: `Database '${config.dbName}' does not exist` };
  }

  // 3. Check Migrations
  const connStr = `postgresql://${config.dbRole}:${encodeURIComponent(config.dbPassword)}@localhost:5432/${config.dbName}`;
  let appliedMigrationCount = 0;
  let diskMigrationCount = 0;

  try {
    const migrationDir = overrides.migrationDir || new URL("../db/migrations", import.meta.url);
    const files = readdirSync(migrationDir);
    diskMigrationCount = files.filter((f) => /^\d{4}_.*\.sql$/.test(f)).length;
  } catch {
    void 0;
  }

  if (!pgLib) {
    console.log(`Database Connection:    Failed (pg dependency missing)`);
    return { success: false, error: "pg dependency missing" };
  }

  let pool;
  try {
    pool = new pgLib.Pool({ connectionString: connStr });
    const res = await pool.query("SELECT COUNT(*) as count FROM drizzle.__drizzle_migrations");
    appliedMigrationCount = parseInt(res.rows[0].count, 10);
  } catch (err) {
    const msg = redact(err.message || String(err), config);
    console.log(`Database Connection:    Failed (${msg})`);
    return { success: false, error: `Database connection failed: ${msg}` };
  } finally {
    if (pool) {
      await pool.end().catch(() => {});
    }
  }

  console.log(`Database Connection:    Ok`);
  console.log(`Migrations on Disk:     ${diskMigrationCount}`);
  console.log(`Migrations Applied:     ${appliedMigrationCount}`);
  const migrationsMatch = diskMigrationCount === appliedMigrationCount;
  console.log(`Migrations Healthy:     ${migrationsMatch ? "Yes" : "No"}`);

  if (!migrationsMatch) {
    return { success: false, error: "Migration count mismatch" };
  }

  // 4. Check API credential
  let credentialOk = false;
  let credentialExists = false;
  const token = config.token;

  const client = new pgLib.Client({ connectionString: connStr });
  try {
    await client.connect();

    // Check actor user, membership and owner role
    const userCheck = await client.query("SELECT 1 FROM users WHERE id = $1", [config.actorId]);
    const membershipCheck = await client.query(
      "SELECT 1 FROM organization_memberships WHERE organization_id = $1 AND user_id = $2",
      [config.orgId, config.actorId],
    );
    const roleCheck = await client.query(
      "SELECT 1 FROM membership_roles WHERE organization_id = $1 AND user_id = $2 AND role = 'owner'",
      [config.orgId, config.actorId],
    );
    const actorOk =
      userCheck.rowCount > 0 && membershipCheck.rowCount > 0 && roleCheck.rowCount > 0;
    console.log(`Actor User & Membership:   ${actorOk ? "Ok" : "Failed"}`);
    if (!actorOk) {
      await client.end().catch(() => {});
      return { success: false, error: "Actor user or membership setup is incomplete" };
    }

    const tableCheck = await client.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'api_credentials'",
    );
    if (tableCheck.rowCount > 0) {
      const resExist = await client.query(
        "SELECT token_hash FROM api_credentials WHERE organization_id = $1 AND id = $2 AND status = 'active'",
        [config.orgId, config.credentialId],
      );
      if (resExist.rowCount > 0) {
        credentialExists = true;
        if (token) {
          const tokenHash = createHash("sha256").update(token).digest("hex");
          if (resExist.rows[0].token_hash === tokenHash) {
            credentialOk = true;
          }
        }
      }
    }
  } catch (err) {
    const msg = redact(err.message || String(err), config);
    console.error("Error checking credentials:", msg);
    return { success: false, error: `Credentials check failed: ${msg}` };
  } finally {
    await client.end().catch(() => {});
  }

  if (token) {
    console.log(
      `Owner API Credential:   ${credentialOk ? "Active (token matches)" : credentialExists ? "Active (token mismatch)" : "Not Found"}`,
    );
    if (!credentialOk) {
      return {
        success: false,
        error: credentialExists ? "Credential token mismatch" : "Owner API credential not found",
      };
    }
  } else {
    console.log(
      `Owner API Credential:   ${credentialExists ? "Active (token not provided in env)" : "Not Found"}`,
    );
    if (!credentialExists) {
      return { success: false, error: "Owner API credential not found" };
    }
  }

  return { success: true };
}

// Entrypoint execution check
if (isMain()) {
  const envUrl = new URL("../.env", import.meta.url);
  loadEnv(envUrl);

  const action = getAction();
  const config = getConfig();
  if (action === "status") {
    runStatus()
      .then((res) => {
        if (!res.success) {
          process.exitCode = 1;
        }
      })
      .catch((err) => {
        console.error("Status check failed:", redact(err.message || String(err), config));
        process.exitCode = 1;
      });
  } else {
    runSetup()
      .then((res) => {
        if (!res.success) {
          process.exitCode = 1;
        }
      })
      .catch((err) => {
        console.error("Setup failed:", redact(err.message || String(err), config));
        process.exitCode = 1;
      });
  }
}
