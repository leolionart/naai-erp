import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NaaiErpClient } from "./client.js";

// T-INT-READ-006: every (resource, action, key) combination must keep resolving to the same HTTP route.
// Regenerate deliberately with UPDATE_ROUTE_GOLDEN=1 only when a route is intentionally added or changed.
const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(here, "__fixtures__", "route-golden.json");
const ACTIONS = [
  "list",
  "get",
  "create",
  "update",
  "delete",
  "export",
  "inventory",
  "history",
  "dry-run",
  "commit",
  "post",
  "approve",
  "reject",
  "void",
  "reverse",
  "deactivate",
  "import",
  "candidates",
  "transfer-candidates",
  "schedule-preview",
  "test",
  "close",
  "reopen",
];
const KEYS = [undefined, "A/B"];

function resourceNames(): string[] {
  const sources = [
    "client.ts",
    "funding-client-routes.ts",
    "payment-evidence-cli.ts",
    "owner-funding-cli.ts",
    "period-close-cli.ts",
    "integration-sources-cli.ts",
    "draft-recording-cli.ts",
    "cit-client.ts",
  ];
  const names = new Set<string>(["discovery", "unknown-resource"]);
  for (const file of sources) {
    const text = readFileSync(join(here, file), "utf8");
    for (const match of text.matchAll(/resource\s*===\s*"([a-z0-9-]+)"/g)) names.add(match[1]!);
    for (const match of text.matchAll(/"([a-z]+(?:-[a-z]+)+)"/g))
      if (
        /(s|policy|policies|derived|plan|funding|settlement|mappings|facts|reviews|rows)$/.test(
          match[1]!,
        )
      )
        names.add(match[1]!);
  }
  return [...names].sort();
}

async function capture(resource: string, action: string, key: string | undefined) {
  const calls: string[] = [];
  const fetchFn = (async (url: string, init?: { method?: string }) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
  const client = new NaaiErpClient(
    { baseUrl: "http://api.test", organizationId: "org-1", token: "t" },
    fetchFn,
  );
  try {
    await client.request(resource, action, { q: "1" }, key, "3", "idem");
    return calls[0] ?? "NO_REQUEST";
  } catch (error) {
    return `ERR ${error instanceof Error ? error.message : String(error)}`.slice(0, 120);
  }
}

describe("T-INT-READ-006 CLI routing golden table", () => {
  it("keeps every resource/action/key route unchanged", async () => {
    const current: Record<string, string> = {};
    const names = process.env.UPDATE_ROUTE_GOLDEN
      ? resourceNames()
      : [
          ...new Set(
            Object.keys(JSON.parse(readFileSync(fixturePath, "utf8")) as object).map(
              (k) => k.split("|")[0]!,
            ),
          ),
        ];
    for (const resource of names) {
      for (const action of ACTIONS) {
        for (const key of KEYS)
          current[`${resource}|${action}|${key ?? ""}`] = await capture(resource, action, key);
      }
    }
    if (process.env.UPDATE_ROUTE_GOLDEN) {
      writeFileSync(fixturePath, `${JSON.stringify(current, null, 0).replace(/","/g, '",\n"')}\n`);
      return;
    }
    const golden = JSON.parse(readFileSync(fixturePath, "utf8")) as Record<string, string>;
    expect(Object.keys(current).length).toBe(Object.keys(golden).length);
    const changed = Object.entries(golden).filter(([k, v]) => current[k] !== v);
    expect(changed.map(([k]) => `${k}: ${golden[k]} -> ${current[k]}`)).toEqual([]);
  });
});
