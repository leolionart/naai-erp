import { describe, expect, it } from "vitest";
import { expenseBreakdownQuery, expenseDrillDownHref } from "./expense-breakdown-report-workspace";

describe("expense breakdown report links", () => {
  it("keeps an explicit report range", () => {
    expect(
      expenseBreakdownQuery(
        new URLSearchParams("startsOn=2026-01-01&endsOn=2026-03-31"),
      ).toString(),
    ).toBe("startsOn=2026-01-01&endsOn=2026-03-31");
  });

  it("drills into the exact month and payee", () => {
    expect(
      expenseDrillDownHref(
        "payee",
        {
          key: "party-1",
          name: "Nhà cung cấp",
          monthly: [],
          netMinor: "1",
          vatMinor: "0",
          grossMinor: "1",
          totalMinor: "1",
          sourceCount: "1",
          drillDown: {},
        },
        "2026-02",
      ),
    ).toBe("/expenses?startsOn=2026-02-01&endsOn=2026-02-28&payeePartyId=party-1");
  });

  it("drills into the exact category supplied by the API", () => {
    expect(
      expenseDrillDownHref(
        "category",
        {
          key: "hosting",
          name: "Hosting",
          monthly: [],
          netMinor: "1",
          vatMinor: "0",
          grossMinor: "1",
          totalMinor: "1",
          sourceCount: "1",
          drillDown: { categoryId: "hosting" },
        },
        "2026-08",
      ),
    ).toBe("/expenses?startsOn=2026-08-01&endsOn=2026-08-31&categoryId=hosting");
  });
});
