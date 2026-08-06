import { describe, expectTypeOf, it } from "vitest";
import type {
  ServiceBusinessMetricsContract,
  ServiceBusinessMetricsQueryContract,
} from "./service-business-metrics.js";

describe("service business metric contracts", () => {
  it("keeps monetary wire values exact strings and ratios nullable", () => {
    expectTypeOf<
      ServiceBusinessMetricsContract["contractedBacklogMinor"]
    >().toEqualTypeOf<string>();
    expectTypeOf<
      ServiceBusinessMetricsContract["backlogCoverageMonthsThousandths"]
    >().toEqualTypeOf<string | null>();
    expectTypeOf<ServiceBusinessMetricsContract["overdueArBps"]>().toEqualTypeOf<number | null>();
  });

  it("supports period and management dimension filters", () => {
    expectTypeOf<ServiceBusinessMetricsQueryContract>().toMatchTypeOf<{
      startsOn: string;
      endsOn: string;
      asOfDate: string;
      clientId?: string;
      projectId?: string;
      serviceLineCode?: string;
    }>();
  });
});
