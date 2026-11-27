import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { executeReadHelper, executeRequest, renderOutput, withListPaging } from "./list-output.js";

describe("T-UNIT-READ-005 CLI output controls", () => {
  const big = {
    data: {
      items: Array.from({ length: 400 }, (_, i) => ({ id: `r${i}`, pad: "x".repeat(2_000) })),
    },
  };

  it("never prints more than the byte budget and always emits valid JSON", () => {
    const out = renderOutput(big, { "max-bytes": "50000" });
    expect(Buffer.byteLength(out.text)).toBeLessThanOrEqual(50_000);
    const parsed = JSON.parse(out.text);
    expect(parsed.meta.truncated).toBe(true);
    expect(parsed.data.items.length).toBeLessThan(400);
    expect(out.hint).toContain("--all --output");
  });

  it("leaves small results untouched", () => {
    expect(renderOutput({ data: { items: [] } }, {})).toEqual({ text: '{"data":{"items":[]}}\n' });
  });

  it("forwards paging flags only for bounded list resources", () => {
    expect(
      withListPaging("expenses", "list", undefined, { limit: "10", cursor: "c", view: "summary" }),
    ).toEqual({
      limit: "10",
      cursor: "c",
      view: "summary",
    });
    expect(withListPaging("reports", "list", { a: 1 }, { limit: "10" })).toEqual({ a: 1 });
    expect(withListPaging("expenses", "get", undefined, { limit: "10" })).toBeUndefined();
  });

  it("--all --output writes NDJSON across pages and reports a compact summary", async () => {
    const calls: unknown[] = [];
    const client = {
      request: async (_r: string, _a: string, payload?: unknown) => {
        calls.push(payload);
        const cursor = (payload as { cursor?: string }).cursor;
        return cursor
          ? { data: { items: [{ id: "c" }] } }
          : { data: { items: [{ id: "a" }, { id: "b" }], nextCursor: "next" } };
      },
    };
    const directory = await mkdtemp(join(tmpdir(), "naai-cli-all-"));
    const file = join(directory, "out.ndjson");
    const summary = await executeRequest(client, "expenses", "list", undefined, {
      all: true,
      output: file,
    });
    expect(summary).toMatchObject({ file, records: 3 });
    expect((await readFile(file, "utf8")).trim().split("\n")).toEqual([
      '{"id":"a"}',
      '{"id":"b"}',
      '{"id":"c"}',
    ]);
    expect(calls).toHaveLength(2);
    await expect(
      executeRequest(client, "expenses", "list", undefined, { all: true }),
    ).rejects.toThrow("--output");
  });

  it("describe returns a compact resource summary and count/summary hit the read endpoints", async () => {
    const getJson = async (path: string) => ({ path });
    const client = { request: async () => ({}), getJson };
    const described = await executeReadHelper(client, "discovery", "describe", undefined, {
      key: "expenses",
    });
    expect(JSON.stringify(described.result).length).toBeLessThan(3_000);
    const count = await executeReadHelper(client, "expenses", "count", { state: "draft" }, {});
    expect(count.result).toEqual({ path: "expenses/count?state=draft" });
    const summary = await executeReadHelper(client, "expenses", "summary", undefined, {
      "group-by": "month",
    });
    expect(summary.result).toEqual({ path: "expenses/summary?groupBy=month" });
    await expect(executeReadHelper(client, "expenses", "summary", undefined, {})).rejects.toThrow(
      "group-by",
    );
    expect((await executeReadHelper(client, "journals", "list", undefined, {})).handled).toBe(
      false,
    );
  });

  it("openapi --tag keeps only the paths of that tag", async () => {
    const spec = {
      paths: {
        "/a": { get: { tags: ["expenses"] } },
        "/b": { get: { tags: ["journals"] } },
      },
    };
    const client = { request: async () => spec };
    const result = await executeReadHelper(client, "discovery", "openapi", undefined, {
      tag: "expenses",
    });
    expect(Object.keys((result.result as typeof spec).paths)).toEqual(["/a"]);
  });
});
