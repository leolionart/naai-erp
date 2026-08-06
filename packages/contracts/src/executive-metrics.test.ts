import { describe, expectTypeOf, it } from "vitest";
import type {
  ExecutiveMetricsContract,
  ExecutiveMetricQueryContract,
  PurposeSpecificRoiContract,
} from "./executive-metrics.js";

describe("ERP-640 executive metric public contracts", () => {
  it("keeps query dimensions and purpose-specific ROI explicit", () => {
    expectTypeOf<ExecutiveMetricQueryContract>().toHaveProperty("projectId");
    expectTypeOf<PurposeSpecificRoiContract["purpose"]>().toEqualTypeOf<
      "project" | "marketing" | "custom"
    >();
    expectTypeOf<ExecutiveMetricsContract["ownerLoansMinor"]>().toEqualTypeOf<string>();
    expectTypeOf<ExecutiveMetricsContract["runwayMonthsThousandths"]>().toEqualTypeOf<
      string | null
    >();
    expectTypeOf<ExecutiveMetricsContract["equityRollForward"]["status"]>().toEqualTypeOf<
      "tied_out" | "difference"
    >();
  });
});
