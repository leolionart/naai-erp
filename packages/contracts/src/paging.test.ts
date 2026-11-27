import { describe, expect, it } from "vitest";
import {
  PagingError,
  decodeCursor,
  encodeCursor,
  paginate,
  parseListQuery,
  resolveMaxResponseBytes,
} from "./paging.js";

describe("T-UNIT-READ-001 bounded read contract", () => {
  it("defaults to 50 and clamps oversized limits reporting limitClamped", () => {
    expect(parseListQuery({})).toMatchObject({ limit: 50, limitClamped: false, view: "summary" });
    expect(parseListQuery({ limit: "100000" })).toMatchObject({ limit: 200, limitClamped: true });
    expect(parseListQuery({ limit: "0" })).toMatchObject({ limit: 1, limitClamped: true });
    expect(parseListQuery({ limit: "30", view: "full" })).toMatchObject({
      limit: 25,
      limitClamped: true,
    });
  });

  it("rejects non numeric limits and unknown views", () => {
    expect(() => parseListQuery({ limit: "abc" })).toThrow(PagingError);
    expect(() => parseListQuery({ limit: "1.5" })).toThrow("LIMIT_INVALID");
    expect(() => parseListQuery({ view: "huge" })).toThrow("VALIDATION_FAILED");
  });

  it("round-trips cursors and rejects corrupt or wrong version cursors", () => {
    const cursor = { k: ["2026-11-01"], id: "exp_1" };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
    expect(() => decodeCursor("not-a-cursor")).toThrow("CURSOR_INVALID");
    const wrong = Buffer.from(JSON.stringify({ v: 2, k: [], id: "x" })).toString("base64url");
    expect(() => decodeCursor(wrong)).toThrow("CURSOR_INVALID");
    expect(() => parseListQuery({ cursor: "###" })).toThrow("CURSOR_INVALID");
  });

  it("paginates with hasMore, stable nextCursor and no overlap across pages", () => {
    const rows = Array.from({ length: 7 }, (_, index) => ({ id: `r${index}`, d: "2026-01-01" }));
    const cursorOf = (row: { id: string; d: string }) => ({ k: [row.d], id: row.id });
    const first = paginate(rows.slice(0, 4), { limit: 3, limitClamped: false, cursorOf });
    expect(first.items.map((row) => row.id)).toEqual(["r0", "r1", "r2"]);
    expect(first.page.hasMore).toBe(true);
    expect(decodeCursor(first.page.nextCursor ?? "").id).toBe("r2");
    const last = paginate(rows.slice(6), { limit: 3, limitClamped: false, cursorOf });
    expect(last.page.hasMore).toBe(false);
    expect(last.page.nextCursor).toBeUndefined();
  });

  it("cuts at a record boundary when the size budget is exceeded", () => {
    const rows = Array.from({ length: 10 }, (_, index) => ({
      id: `r${index}`,
      pad: "x".repeat(10_000),
    }));
    const result = paginate(rows, {
      limit: 10,
      limitClamped: false,
      maxBytes: 32 * 1024,
      cursorOf: (row) => ({ k: [], id: row.id }),
    });
    expect(result.meta.truncated).toBe(true);
    expect(result.meta.bytes).toBeLessThanOrEqual(32 * 1024);
    expect(result.items).toHaveLength(3);
    expect(decodeCursor(result.page.nextCursor ?? "").id).toBe("r2");
    expect(result.meta.hint).toContain("view=summary");
  });

  it("always returns at least one record and enforces the minimum budget", () => {
    const result = paginate([{ id: "big", pad: "x".repeat(100_000) }], {
      limit: 5,
      limitClamped: false,
      maxBytes: 1,
      cursorOf: (row) => ({ k: [], id: row.id }),
    });
    expect(result.items).toHaveLength(1);
    expect(resolveMaxResponseBytes("10")).toBe(32 * 1024);
    expect(resolveMaxResponseBytes(undefined)).toBe(256 * 1024);
  });
});
