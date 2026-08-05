import { describe, expect, it } from "vitest";
import { schema } from "./schema.js";
describe("ERP-500 workforce schema", () => {
  it("exports controlled workforce time and capacity tables", () => {
    expect(Object.keys(schema)).toEqual(
      expect.arrayContaining([
        "workforceProfiles",
        "laborCostRates",
        "timesheets",
        "timesheetEntries",
        "timesheetCostSnapshots",
        "timesheetAdjustments",
        "workforceCapacityVersions",
      ]),
    );
  });
});
