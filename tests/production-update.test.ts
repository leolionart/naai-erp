import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");

function fixture() {
  const directory = mkdtempSync(resolve(tmpdir(), "naai-erp-production-update-"));
  const docker = resolve(directory, "docker");
  const log = resolve(directory, "docker.log");
  const envFile = resolve(directory, ".env.production");
  writeFileSync(envFile, "POSTGRES_PASSWORD=test-only\nIMAGE_TAG=sha-old-release\n");
  writeFileSync(
    docker,
    `#!/bin/sh
printf '%s\\n' "$*" >> "$DOCKER_CALL_LOG"
case "$*" in
  *"ps -a --format json"*)
    printf '%s\\n' '[{"Service":"postgres","State":"running","Health":"healthy"},{"Service":"migrate","State":"exited","ExitCode":0},{"Service":"api","State":"running","Health":"healthy"},{"Service":"worker","State":"running","Health":"healthy"},{"Service":"web","State":"running","Health":"healthy"}]'
    ;;
  *"--exit-code-from migrate migrate"*)
    if [ "$FAIL_MIGRATE" = "1" ]; then exit 23; fi
    ;;
esac
`,
  );
  chmodSync(docker, 0o755);
  return { directory, envFile, log };
}

function updaterEnv(directory: string, log: string) {
  return {
    ...process.env,
    PATH: `${directory}:${process.env.PATH}`,
    DOCKER_CALL_LOG: log,
  };
}

describe("production latest-image updater", () => {
  it("enforces latest, migrates during downtime, then recreates and verifies services", () => {
    const { directory, envFile, log } = fixture();
    const output = execFileSync("node", ["scripts/update-production-latest.mjs", envFile], {
      cwd: root,
      env: updaterEnv(directory, log),
      encoding: "utf8",
    });
    const calls = readFileSync(log, "utf8").trim().split("\n");

    expect(output).toContain("IMAGE_TAG=latest");
    expect(calls.every((call) => call.includes("--env-file"))).toBe(true);
    expect(calls.every((call) => call.includes("-f compose.yaml"))).toBe(true);
    expect(calls.findIndex((call) => call.endsWith("pull"))).toBeLessThan(
      calls.findIndex((call) => call.endsWith("stop web worker api")),
    );
    expect(
      calls.findIndex((call) => call.includes("--exit-code-from migrate migrate")),
    ).toBeLessThan(
      calls.findIndex((call) => call.includes("--no-deps --force-recreate --wait api worker web")),
    );
    expect(
      calls.some((call) => call.includes("exec -T api") && call.includes("health/ready")),
    ).toBe(true);
    expect(
      calls.some((call) => call.includes("exec -T web") && call.includes(":3000/health")),
    ).toBe(true);
  });

  it("does not restart application services after a failed migration", () => {
    const { directory, envFile, log } = fixture();
    const result = spawnSync("node", ["scripts/update-production-latest.mjs", envFile], {
      cwd: root,
      env: { ...updaterEnv(directory, log), FAIL_MIGRATE: "1" },
      encoding: "utf8",
    });
    const calls = readFileSync(log, "utf8");

    expect(result.status).not.toBe(0);
    expect(calls).toContain("stop web worker api");
    expect(calls).toContain("--exit-code-from migrate migrate");
    expect(calls).not.toContain("--no-deps --force-recreate --wait api worker web");
  });
});
