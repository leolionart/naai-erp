import { describe, expect, it } from "vitest";
import { of } from "rxjs";
import { BoundedListInterceptor } from "./bounded-list.interceptor.js";

function run(
  body: unknown,
  query: Record<string, string> = {},
  url = "/api/v1/organizations/o/evidence",
  method = "GET",
) {
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({ method, url, params: { organizationId: "o" }, query }),
    }),
  };
  let output: unknown;
  new BoundedListInterceptor()
    .intercept(context as never, { handle: () => of(body) } as never)
    .subscribe({ next: (value) => (output = value), error: (error) => (output = { error }) });
  if ((output as { error?: unknown } | undefined)?.error) throw (output as { error: Error }).error;
  return output as {
    data: { items: { id: string }[]; hasMore: boolean } & { id: string }[];
    page: { hasMore: boolean; nextCursor?: string; limit: number; total: number };
    meta: { count: number };
  };
}

const rows = (count: number) => Array.from({ length: count }, (_, i) => ({ id: `r${i}`, n: i }));

describe("T-UNIT-READ-008 bounded list safety net", () => {
  it("bounds item lists to 50 and declares the remaining pages", () => {
    const result = run({ data: { items: rows(120) } });
    expect(result.data.items).toHaveLength(50);
    expect(result.data.hasMore).toBe(true);
    expect(result.page).toMatchObject({ hasMore: true, limit: 50, total: 120 });
    expect(result.meta.count).toBe(50);
  });

  it("walks every page of an array response without gaps or duplicates", () => {
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 10; guard += 1) {
      const result = run({ data: rows(120) }, { limit: "40", ...(cursor ? { cursor } : {}) });
      seen.push(...result.data.map((row: { id: string }) => row.id));
      cursor = result.page.nextCursor;
      if (!cursor) break;
    }
    expect(seen).toHaveLength(120);
    expect(new Set(seen).size).toBe(120);
  });

  it("leaves routes with their own paging, aggregates, exports and writes untouched", () => {
    const own = { data: { items: rows(80), nextCursor: "x" } };
    expect(run(own)).toBe(own);
    const bounded = { data: { items: rows(80), hasMore: false, limit: 50 } };
    expect(run(bounded)).toBe(bounded);
    const report = { data: { items: rows(80) } };
    expect(run(report, {}, "/api/v1/organizations/o/reports/x")).toBe(report);
    expect(run(report, {}, "/api/v1/organizations/o/master-data/parties")).toBe(report);
    expect(run(report, {}, "/api/v1/organizations/o/funding-plans/export")).toBe(report);
    expect(run(report, {}, "/api/v1/organizations/o/evidence", "POST")).toBe(report);
  });

  it("passes a small result through as a single complete page and rejects bad limits", () => {
    const result = run({ data: { items: rows(3) } });
    expect(result.data.items).toHaveLength(3);
    expect(result.page).toMatchObject({ hasMore: false, total: 3 });
    expect(() => run({ data: { items: rows(3) } }, { limit: "abc" })).toThrow("LIMIT_INVALID");
  });
});
