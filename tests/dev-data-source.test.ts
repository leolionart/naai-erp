import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "..");
const script = join(repositoryRoot, "scripts/dev-data-source.mjs");
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function fixture(options: { nodeExit?: number; pnpmExit?: number } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "naai-dev-data-source-"));
  temporaryDirectories.push(directory);
  const capture = join(directory, "capture.log");
  const executable = (name: "node" | "pnpm", exitCode: number) => {
    const path = join(directory, name);
    writeFileSync(
      path,
      `#!/bin/sh
printf '%s|%s|%s|%s|%s|%s|%s\n' '${name}' "$*" "$DATABASE_URL" "$NEXT_PUBLIC_API_URL" "$NEXT_PUBLIC_ORGANIZATION_ID" "$NEXT_PUBLIC_FORCE_DEFAULT_API_CONNECTION" "$NEXT_PUBLIC_NAAI_ERP_DATA_SOURCE" >> "$DEV_DATA_CAPTURE"
echo '${name}-stdout'
echo '${name}-stderr' >&2
exit ${exitCode}
`,
    );
    chmodSync(path, 0o755);
  };
  executable("node", options.nodeExit ?? 0);
  executable("pnpm", options.pnpmExit ?? 0);
  return {
    capture,
    environment: {
      ...process.env,
      PATH: `${directory}${delimiter}${process.env.PATH ?? ""}`,
      DEV_DATA_CAPTURE: capture,
    },
  };
}

function run(args: readonly string[], environment: NodeJS.ProcessEnv = process.env) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: repositoryRoot,
    env: environment,
    encoding: "utf8",
  });
}

describe("development data-source selector", () => {
  it("rejects a missing or unsupported profile before starting child processes", () => {
    const missing = run([]);
    expect(missing.status).not.toBe(0);
    expect(missing.stderr).toContain(
      "Usage: node scripts/dev-data-source.mjs <local|production> [--check|--write]",
    );

    const unsupported = run(["staging"]);
    expect(unsupported.status).not.toBe(0);
    expect(unsupported.stderr).toContain("Usage:");
  });

  it("delegates production checks without resolving or exposing the production token itself", () => {
    const testFixture = fixture();
    const result = run(["production", "--check"], testFixture.environment);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(
      "Data source: production API through the server-only read proxy.",
    );
    expect(readFileSync(testFixture.capture, "utf8")).toContain(
      "node|scripts/dev-web-production-data.mjs --check",
    );
  });

  it("checks the local database without overriding the env-selected web data source", () => {
    const testFixture = fixture();
    const result = run(["local", "--check"], {
      ...testFixture.environment,
      DATABASE_URL: "postgresql://local-only/database",
      NAAI_ERP_LOCAL_ORGANIZATION: "local-org",
      NEXT_PUBLIC_NAAI_ERP_DATA_SOURCE: "production",
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(
      "Local-data development configuration is ready (local-org, API :3001).",
    );
    expect(readFileSync(testFixture.capture, "utf8")).toContain(
      "node|scripts/native-dev-db.mjs status|postgresql://local-only/database||||production",
    );
  });

  it("fails closed when the local database status check fails", () => {
    const testFixture = fixture({ nodeExit: 7 });
    const result = run(["local", "--check"], testFixture.environment);

    expect(result.status).toBe(7);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("node-stdout");
    expect(result.stderr).toContain("node-stderr");
    expect(readFileSync(testFixture.capture, "utf8")).not.toContain("pnpm|");
  });

  it("rejects production write flags in the local profile", () => {
    const testFixture = fixture();
    const result = run(["local", "--write"], testFixture.environment);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("--write only applies to the production-backed profile");
    expect(() => readFileSync(testFixture.capture, "utf8")).toThrow();
  });

  it("runs local setup before starting the combined API and web preview", () => {
    const testFixture = fixture();
    const result = run(["local"], {
      ...testFixture.environment,
      NEXT_PUBLIC_NAAI_ERP_DATA_SOURCE: "local",
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("Data source: local PostgreSQL and local API");
    const calls = readFileSync(testFixture.capture, "utf8").trim().split("\n");
    expect(calls[0]).toContain("node|scripts/native-dev-db.mjs setup|");
    expect(calls[1]).toContain("pnpm|dev:preview|");
    expect(calls[1]).toMatch(/\|\|\|\|local$/);
  });
});
