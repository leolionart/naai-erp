import { describe, expect, it } from "vitest";
import {
  FORECAST_COMPOSITION_CONTRACT_VERSION,
  type CreateForecastComponentRequest,
  type ForecastCompositionContract,
} from "./forecast-composition.js";

describe("ERP-610 forecast composition contracts", () => {
  it("keeps exact money, source identity and probability machine-readable", () => {
    const request: CreateForecastComponentRequest = {
      schemaVersion: FORECAST_COMPOSITION_CONTRACT_VERSION,
      section: "revenue",
      kind: "weighted_pipeline",
      direction: "increase",
      scheduledOn: "2026-09-30",
      amountMinor: "1000000000000000001",
      probabilityBps: 3750,
      currency: "VND",
      source: {
        type: "opportunity",
        id: "opportunity-1",
        commercialRootType: "opportunity",
        commercialRootId: "opportunity-1",
      },
      reason: "Reviewed sales pipeline",
    };
    expect(request.amountMinor).toBe("1000000000000000001");
    expect(request.probabilityBps).toBe(3750);
  });

  it("labels revenue, expense and cash formulas without binary-float money", () => {
    const composition = {
      schemaVersion: FORECAST_COMPOSITION_CONTRACT_VERSION,
      organizationId: "org-naai",
      forecastVersionId: "forecast-1",
      formulaVersion: "forecast-composition-v1",
      actualBasis: "recognized",
      asOfDate: "2026-08-31",
      startsOn: "2026-08-01",
      endsOn: "2026-12-31",
      currency: "VND",
      actualToDateMinor: "40000000",
      committedMilestonesMinor: "30000000",
      scheduledRecurringRevenueMinor: "12000000",
      weightedPipelineMinor: "10000000",
      manualRevenueAdjustmentMinor: "-2000000",
      projectedRevenueMinor: "90000000",
      payrollExpenseMinor: "35000000",
      recurringOpexMinor: "8000000",
      manualExpenseAdjustmentMinor: "1000000",
      projectedExpenseMinor: "44000000",
      openingCashMinor: "25000000",
      expectedCollectionsMinor: "50000000",
      financingMinor: "10000000",
      payrollCashOutMinor: "35000000",
      apDueMinor: "12000000",
      recurringExpenseCashOutMinor: "8000000",
      taxCashOutMinor: "3000000",
      capexCashOutMinor: "5000000",
      manualCashAdjustmentMinor: "0",
      projectedClosingCashMinor: "22000000",
      componentIds: [],
      sourceIds: [],
      components: [],
      confidenceFlags: [],
    } satisfies ForecastCompositionContract;
    expect(composition.projectedClosingCashMinor).toBe("22000000");
    expect(composition.actualBasis).toBe("recognized");
  });
});
