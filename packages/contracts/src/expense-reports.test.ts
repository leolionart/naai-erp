import { describe, expect, it } from "vitest";
import type { ExpenseBreakdownReportContract } from "./expense-reports.js";
import { EXPENSE_REPORT_CONTRACT_VERSION } from "./expense-reports.js";

describe("expense report contract", () => {
  it("keeps exact minor units and separates currencies", () => {
    const report: ExpenseBreakdownReportContract = {
      contractVersion: EXPENSE_REPORT_CONTRACT_VERSION,
      basis: "posted-expense-sources",
      dimension: "payee",
      startsOn: "2026-01-01",
      endsOn: "2026-12-31",
      seriesByCurrency: [],
    };
    expect(report.contractVersion).toBe("2026-08-10");
    expect(report.seriesByCurrency).toEqual([]);
  });
});
