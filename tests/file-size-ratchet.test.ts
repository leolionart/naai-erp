import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const script = resolve(import.meta.dirname, "../scripts/check-file-size.mjs");
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function lines(count: number) {
  return Array.from({ length: count }, (_, index) => `export const v${index} = ${index};`).join(
    "\n",
  );
}

function repo(files: Record<string, number>, baseline?: Record<string, number>) {
  const root = mkdtempSync(join(tmpdir(), "naai-file-size-"));
  directories.push(root);
  mkdirSync(join(root, "scripts"), { recursive: true });
  for (const [path, count] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), lines(count));
  }
  if (baseline)
    writeFileSync(join(root, "scripts/file-size-baseline.json"), JSON.stringify(baseline));
  return root;
}

function run(root: string, ...args: string[]) {
  return spawnSync(process.execPath, [script, "--root", root, ...args], { encoding: "utf8" });
}

describe("T-UNIT-SIZE-001 file size ratchet (BR-SIZE-001)", () => {
  it("fails for an oversized file that is not in the baseline", () => {
    const root = repo({ "apps/api/src/big.ts": 501 }, {});
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("apps/api/src/big.ts");
  });

  it("fails when a baselined file grows by a single line", () => {
    const root = repo({ "apps/api/src/big.ts": 601 }, { "apps/api/src/big.ts": 600 });
    expect(run(root).status).toBe(1);
  });

  it("requires lowering the baseline when a file shrinks and removal when it is within the limit", () => {
    expect(run(repo({ "apps/api/src/big.ts": 550 }, { "apps/api/src/big.ts": 600 })).status).toBe(
      1,
    );
    expect(run(repo({ "apps/api/src/big.ts": 500 }, { "apps/api/src/big.ts": 600 })).status).toBe(
      1,
    );
  });

  it("passes when sizes equal the baseline and ignores tests, blank lines and comments", () => {
    const root = repo(
      { "apps/api/src/big.ts": 600, "apps/api/src/big.test.ts": 900 },
      { "apps/api/src/big.ts": 600 },
    );
    mkdirSync(join(root, "packages/x/src"), { recursive: true });
    writeFileSync(
      join(root, "packages/x/src/commented.ts"),
      `${lines(500)}\n\n// comment\n/* block\n   comment */\n`,
    );
    const result = run(root);
    expect(result.status, result.stderr).toBe(0);
  });

  it("--update lowers or removes entries but never adds files or raises numbers", () => {
    const root = repo(
      { "apps/api/src/a.ts": 550, "apps/api/src/b.ts": 400, "apps/api/src/new.ts": 700 },
      { "apps/api/src/a.ts": 600, "apps/api/src/b.ts": 600 },
    );
    expect(run(root, "--update").status).toBe(0);
    const baseline = JSON.parse(
      readFileSync(join(root, "scripts/file-size-baseline.json"), "utf8"),
    );
    expect(baseline).toEqual({ "apps/api/src/a.ts": 550 });
  });
});
