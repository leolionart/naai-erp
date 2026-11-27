import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { executeRequest, renderOutput, withListPaging } from "./list-output.js";

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
});
