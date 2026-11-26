#!/usr/bin/env node

import { spawn, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import net from "node:net";
import { resolve } from "node:path";
import process from "node:process";

const rootDir = resolve(import.meta.dirname, "..");
const requireDb = createRequire(resolve(rootDir, "packages/database/package.json"));
const pg = requireDb("pg");

const ORG_ID = "org-ui";
const OWNER_TOKEN = "ui-owner-token";
const INT_TOKEN = "ui-int-token";
const SESSION_SECRET = "real-ui-e2e-secret-at-least-32-characters-long";

function getFreePort() {
  return new Promise((resolvePort, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Could not resolve ephemeral TCP port")));
        return;
      }
      const { port } = address;
      server.close((err) => (err ? reject(err) : resolvePort(port)));
    });
  });
}

function buildDbUrls(baseUrl, scratchDbName) {
  if (baseUrl.startsWith("postgresql:///") || baseUrl.startsWith("postgres:///")) {
    const qIndex = baseUrl.indexOf("?");
    const query = qIndex >= 0 ? baseUrl.slice(qIndex) : "";
    return {
      adminUrl: `postgresql:///postgres${query}`,
      scratchUrl: `postgresql:///${scratchDbName}${query}`,
    };
  }
  const parsed = new URL(baseUrl);
  const adminParsed = new URL(baseUrl);
  adminParsed.pathname = "/postgres";
  parsed.pathname = `/${scratchDbName}`;
  return {
    adminUrl: adminParsed.toString(),
    scratchUrl: parsed.toString(),
  };
}

async function resolvePostgresConnection(scratchDbName) {
  const candidates = [
    process.env.REAL_UI_ADMIN_DATABASE_URL,
    process.env.DATABASE_URL,
    "postgresql://naai_erp:naai_erp@127.0.0.1:5432/postgres",
    "postgresql:///postgres?host=/tmp",
  ].filter(Boolean);

  let lastError;
  for (const candidate of candidates) {
    const urls = buildDbUrls(candidate, scratchDbName);
    const client = new pg.Client({ connectionString: urls.adminUrl });
    try {
      await client.connect();
      await client.query("SELECT 1");
      await client.end();
      return urls;
    } catch (error) {
      lastError = error;
      await client.end().catch(() => {});
    }
  }
  throw new Error(
    `Unable to connect to PostgreSQL for scratch E2E setup: ${lastError?.message ?? "unknown error"}`,
  );
}

async function createScratchDatabase(adminUrl, scratchDbName) {
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(`CREATE DATABASE "${scratchDbName}"`);
  } finally {
    await client.end();
  }
}

async function dropScratchDatabase(adminUrl, scratchDbName) {
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    try {
      await client.query(`DROP DATABASE IF EXISTS "${scratchDbName}" WITH (FORCE)`);
    } catch {
      await client.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [scratchDbName],
      );
      await client.query(`DROP DATABASE IF EXISTS "${scratchDbName}"`);
    }
  } finally {
    await client.end();
  }
}

async function seedBaselineOrganization(scratchUrl, year) {
  const client = new pg.Client({ connectionString: scratchUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO organizations(id, legal_name, base_currency, timezone)
       VALUES ($1, 'UI Verify Co', 'VND', 'Asia/Ho_Chi_Minh')`,
      [ORG_ID],
    );
    await client.query(
      `INSERT INTO fiscal_years(organization_id, year, starts_on, ends_on)
       VALUES ($1, $2, make_date($2, 1, 1), make_date($2, 12, 31))`,
      [ORG_ID, year],
    );
    await client.query(
      `INSERT INTO fiscal_periods(organization_id, fiscal_year, period_number, starts_on, ends_on)
       SELECT $1, $2, n,
              make_date($2, n, 1),
              (make_date($2, n, 1) + interval '1 month - 1 day')::date
         FROM generate_series(1, 12) AS n`,
      [ORG_ID, year],
    );
    await client.query(
      `INSERT INTO accounts(organization_id, code, name, root_type, is_control_account, allow_manual_posting) VALUES
        ($1, '111', 'Tiền mặt', 'asset', false, true),
        ($1, '111-CASH', 'Cash', 'asset', false, true),
        ($1, '112', 'Tiền gửi ngân hàng', 'asset', false, true),
        ($1, '112-BANK', 'Bank', 'asset', false, true),
        ($1, '131', 'Phải thu khách hàng', 'asset', true, false),
        ($1, '131-AR', 'AR', 'asset', true, false),
        ($1, '331', 'Phải trả người bán', 'liability', true, false),
        ($1, '331-AP', 'AP', 'liability', true, false),
        ($1, '3388-OWNER', 'Owner current', 'liability', false, true),
        ($1, '511', 'Doanh thu bán hàng và dịch vụ', 'revenue', false, true),
        ($1, '5113', 'Doanh thu cung cấp dịch vụ', 'revenue', false, true),
        ($1, '511-REV', 'Revenue', 'revenue', false, true),
        ($1, '3331', 'Thuế GTGT phải nộp', 'liability', true, false),
        ($1, '3331-VAT-OUT', 'VAT out', 'liability', true, false),
        ($1, '642', 'Chi phí quản lý doanh nghiệp', 'expense', false, true),
        ($1, '6428', 'Chi phí bằng tiền khác', 'expense', false, true),
        ($1, '642-OPEX', 'Opex', 'expense', false, true),
        ($1, '632-COST', 'Cost', 'expense', false, true),
        ($1, '1331', 'Thuế GTGT được khấu trừ', 'asset', true, false),
        ($1, '1331-VAT', 'VAT in', 'asset', true, false)`,
      [ORG_ID],
    );
    await client.query(
      `INSERT INTO financial_statement_mapping_versions(
         organization_id, id, version, framework, state, effective_from,
         change_reason, created_by, approved_by, approved_at
       ) VALUES ($1, 'map', 1, 'TT133', 'approved', make_date($2, 1, 1), 'seed', 'seed', 'seed', now())`,
      [ORG_ID, year],
    );
    await client.query(
      `INSERT INTO financial_statement_mapping_lines(
         organization_id, mapping_id, mapping_version, line_number,
         statement, line_code, label, account_code, display_order, sign
       ) VALUES ($1, 'map', 1, 1, 'balance_sheet', 'owner_current', 'Owner current', '3388-OWNER', 10, 1)`,
      [ORG_ID],
    );
    await client.query(
      `INSERT INTO parties(organization_id, id, display_name, legal_name, normalized_tax_id, status) VALUES
        ($1, 'CLIENT', 'Khách hàng A', 'Công ty TNHH Khách hàng A', '0311111111', 'active'),
        ($1, 'SUP', 'Nhà cung cấp B', 'Công ty TNHH Nhà cung cấp B', '0312345678', 'active')`,
      [ORG_ID],
    );
    await client.query(
      `INSERT INTO party_roles(organization_id, party_id, role) VALUES
        ($1, 'CLIENT', 'client'),
        ($1, 'SUP', 'supplier')`,
      [ORG_ID],
    );
    await client.query(
      `INSERT INTO users(id, email, display_name)
       VALUES ('ui-owner', 'ui-owner@example.com', 'UI Owner')`,
    );
    await client.query(
      `INSERT INTO organization_memberships(organization_id, user_id)
       VALUES ($1, 'ui-owner')`,
      [ORG_ID],
    );
    await client.query(
      `INSERT INTO membership_roles(organization_id, user_id, role)
       VALUES ($1, 'ui-owner', 'owner')`,
      [ORG_ID],
    );
    await client.query(
      `INSERT INTO projects(
         organization_id, id, code, name, client_party_id, owner_user_id,
         contract_type, currency, budget_minor, starts_on, state
       ) VALUES ($1, 'PRJ', 'PRJ', 'Dự án A', 'CLIENT', 'ui-owner', 'fixed_fee', 'VND', 100000000, make_date($2, 1, 1), 'active')`,
      [ORG_ID, year],
    );
    await client.query(
      `INSERT INTO contracts(organization_id, id, project_id, reference, signed_on, value_minor, currency)
       VALUES ($1, 'CON', 'PRJ', 'CON', make_date($2, 1, 1), 100000000, 'VND')`,
      [ORG_ID, year],
    );
    await client.query(
      `INSERT INTO financial_accounts(
         organization_id, id, code, kind, display_name, currency, ledger_account_code, bank_code, created_by, updated_by
       ) VALUES
        ($1, 'fa-company', 'CASH-COMPANY', 'cash', 'Quỹ tiền mặt công ty', 'VND', '111-CASH', null, 'seed', 'seed'),
        ($1, 'fa-custody', 'CASH-OWNER-CUSTODY', 'cash', 'Tiền công ty chủ giữ hộ', 'VND', '111-CASH', null, 'seed', 'seed'),
        ($1, 'fa-bank', 'BANK-COMPANY', 'bank', 'Tài khoản ngân hàng công ty', 'VND', '112-BANK', 'VCB', 'seed', 'seed')`,
      [ORG_ID],
    );
    // Intentionally seed ONLY canonical business_categories & expense_categories (zero dimension_values rows).
    await client.query(`DELETE FROM business_categories WHERE organization_id = $1`, [ORG_ID]);
    await client.query(
      `INSERT INTO business_categories(organization_id, kind, code, name, account_code, is_active) VALUES
        ($1, 'expense', 'OFFICE', 'Văn phòng', '642-OPEX', true),
        ($1, 'expense', 'TRAVEL', 'Công tác phí', '642-OPEX', true),
        ($1, 'revenue', 'SERVICE', 'Dịch vụ', '511-REV', true),
        ($1, 'revenue', 'CONSULTING', 'Tư vấn', '511-REV', true)`,
      [ORG_ID],
    );
    await client.query(
      `INSERT INTO expense_categories(organization_id, code, name, funding_treatment, created_by, updated_by) VALUES
        ($1, 'OFFICE', 'Văn phòng', 'company_funds', 'seed', 'seed'),
        ($1, 'TRAVEL', 'Công tác phí', 'company_funds', 'seed', 'seed')`,
      [ORG_ID],
    );
    await client.query(
      `INSERT INTO accounting_workflow_policies(
         organization_id, allow_self_approval, self_approval_max_minor, operating_mode, updated_by
       ) VALUES ($1, false, null, 'solopreneur', 'seed')`,
      [ORG_ID],
    );
    await client.query(
      `INSERT INTO api_credentials(organization_id, id, actor_id, token_hash, roles) VALUES
        ($1, 'c-owner', 'ui-owner', encode(sha256($2::bytea), 'hex'), '["owner"]'),
        ($1, 'c-int', 'n8n-bot', encode(sha256($3::bytea), 'hex'), '["integration"]')`,
      [ORG_ID, OWNER_TOKEN, INT_TOKEN],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

async function waitForHttpOk(url, label, child, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`${label} exited prematurely with code ${child.exitCode}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Server still starting.
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for ${label} at ${url}`);
}

function stopChild(child) {
  return new Promise((resolveStop) => {
    if (!child || child.exitCode !== null) {
      resolveStop();
      return;
    }
    const killGroup = (signal) => {
      try {
        if (child.pid) process.kill(-child.pid, signal);
      } catch {
        try {
          child.kill(signal);
        } catch {
          // Ignore already-terminated process.
        }
      }
    };
    const timer = setTimeout(() => killGroup("SIGKILL"), 5_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolveStop();
    });
    killGroup("SIGTERM");
  });
}

function sanitizedEnv(overrides) {
  const next = { ...process.env };
  for (const key of Object.keys(next)) {
    if (key.startsWith("NAAI_ERP_PROD_") || key.startsWith("NEXT_PUBLIC_")) {
      delete next[key];
    }
  }
  return { ...next, ...overrides };
}

async function main() {
  const suffix = `${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
  const scratchDbName = `naai_ui_${suffix}`;
  const apiPort = Number(process.env.REAL_UI_API_PORT || (await getFreePort()));
  const webPort = Number(process.env.REAL_UI_WEB_PORT || (await getFreePort()));
  const apiUrl = `http://127.0.0.1:${apiPort}`;
  const webUrl = `http://127.0.0.1:${webPort}`;
  const currentYear = new Date().getFullYear();

  const { adminUrl, scratchUrl } = await resolvePostgresConnection(scratchDbName);
  console.log(`[real-ui-e2e] Creating scratch database ${scratchDbName}...`);
  await createScratchDatabase(adminUrl, scratchDbName);

  let apiProcess;
  let webProcess;
  let cleanedUp = false;
  const cleanup = async () => {
    if (cleanedUp) return;
    cleanedUp = true;
    console.log("[real-ui-e2e] Stopping servers and dropping scratch database...");
    await Promise.all([stopChild(webProcess), stopChild(apiProcess)]);
    await dropScratchDatabase(adminUrl, scratchDbName).catch((err) => {
      console.error(`[real-ui-e2e] Warning: failed to drop ${scratchDbName}: ${err.message}`);
    });
  };
  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.once(sig, () => {
      void cleanup().finally(() => process.exit(130));
    });
  }

  try {
    console.log("[real-ui-e2e] Running database migrations on scratch DB...");
    execFileSync("pnpm", ["--filter", "@naai-erp/database", "db:migrate"], {
      cwd: rootDir,
      stdio: "inherit",
      env: sanitizedEnv({ DATABASE_URL: scratchUrl }),
    });

    console.log("[real-ui-e2e] Seeding canonical baseline organization...");
    await seedBaselineOrganization(scratchUrl, currentYear);

    console.log(`[real-ui-e2e] Starting real API server on ${apiUrl}...`);
    apiProcess = spawn("pnpm", ["--filter", "@naai-erp/api", "exec", "tsx", "src/main.ts"], {
      cwd: rootDir,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: sanitizedEnv({
        DATABASE_URL: scratchUrl,
        HOST: "127.0.0.1",
        PORT: String(apiPort),
        MIGRATE_ON_START: "0",
        NODE_ENV: "development",
        SESSION_SECRET,
        WEB_ORIGIN: webUrl,
      }),
    });
    apiProcess.stderr.on("data", (chunk) => process.stderr.write(`[api] ${chunk}`));
    await waitForHttpOk(`${apiUrl}/health/ready`, "API server", apiProcess);

    console.log(`[real-ui-e2e] Starting real Next.js web server on ${webUrl}...`);
    webProcess = spawn(
      "pnpm",
      [
        "--filter",
        "@naai-erp/web",
        "exec",
        "next",
        "dev",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(webPort),
      ],
      {
        cwd: rootDir,
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: sanitizedEnv({
          NODE_ENV: "development",
          API_BASE_URL: apiUrl,
          NEXT_PUBLIC_API_URL: apiUrl,
          NEXT_PUBLIC_ORGANIZATION_ID: ORG_ID,
          NEXT_PUBLIC_API_TOKEN: OWNER_TOKEN,
          NEXT_PUBLIC_NAAI_ERP_DATA_SOURCE: "local",
          NEXT_PUBLIC_FORCE_DEFAULT_API_CONNECTION: "1",
          NEXT_TELEMETRY_DISABLED: "1",
          SESSION_SECRET,
        }),
      },
    );
    webProcess.stderr.on("data", (chunk) => process.stderr.write(`[web] ${chunk}`));
    await waitForHttpOk(`${webUrl}/health`, "Web server", webProcess, 120_000);

    console.log("[real-ui-e2e] Running Playwright real-UI specs...");
    const extraArgs = process.argv.slice(2);
    const exitCode = await new Promise((resolvePlaywright, rejectPlaywright) => {
      const pw = spawn(
        "pnpm",
        [
          "--filter",
          "@naai-erp/web",
          "exec",
          "playwright",
          "test",
          "-c",
          "playwright.real.config.ts",
          ...extraArgs,
        ],
        {
          cwd: rootDir,
          stdio: "inherit",
          env: sanitizedEnv({
            NODE_ENV: "development",
            CI: process.env.CI ?? "",
            PLAYWRIGHT_PORT: String(webPort),
            PLAYWRIGHT_SKIP_WEBSERVER: "1",
            REAL_UI_API_URL: apiUrl,
            REAL_UI_ORG_ID: ORG_ID,
            REAL_UI_OWNER_TOKEN: OWNER_TOKEN,
            REAL_UI_INT_TOKEN: INT_TOKEN,
            REAL_UI_YEAR: String(currentYear),
          }),
        },
      );
      pw.on("error", rejectPlaywright);
      pw.on("exit", (code) => resolvePlaywright(code ?? 1));
    });

    if (exitCode !== 0) {
      process.exitCode = exitCode;
    }
  } finally {
    await cleanup();
  }
}

await main();
