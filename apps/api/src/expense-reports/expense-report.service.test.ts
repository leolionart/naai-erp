import { describe, expect, it } from "vitest";
import { ExpenseReportService } from "./expense-report.service.js";

describe("ExpenseReportService", () => {
  const service = new ExpenseReportService({ facts: async () => [] } as never, {} as never);
  it("aggregates exact monthly values and reconciles per currency", () => {
    const result = service.aggregate(
      [
        {
          sourceId: "e1",
          month: "2026-01",
          currency: "VND",
          dimensionKey: "p1",
          dimensionName: "A",
          netMinor: "9007199254740990",
          vatMinor: "3",
          amountMinor: "9007199254740993",
        },
        {
          sourceId: "e2",
          month: "2026-02",
          currency: "VND",
          dimensionKey: "p1",
          dimensionName: "A",
          netMinor: "7",
          vatMinor: "0",
          amountMinor: "7",
        },
        {
          sourceId: "e3",
          month: "2026-01",
          currency: "USD",
          dimensionKey: null,
          dimensionName: null,
          netMinor: "9",
          vatMinor: "1",
          amountMinor: "10",
        },
      ],
      { startsOn: "2026-01-01", endsOn: "2026-02-28" },
      "payee",
    );
    expect(result.seriesByCurrency).toHaveLength(2);
    expect(result.seriesByCurrency.find((x) => x.currency === "VND")?.totalMinor).toBe(
      "9007199254741000",
    );
    expect(result.seriesByCurrency.every((x) => x.reconciliation.differenceMinor === "0")).toBe(
      true,
    );
  });
});
