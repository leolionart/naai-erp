import { describe, expectTypeOf, it } from "vitest";
import type {
  FinancialSourceRefContract,
  FinancialSourceResolutionContract,
  FinancialStatementDrilldownItemContract,
} from "./financial-drilldown.js";

describe("ERP-700 financial source drilldown contracts", () => {
  it("keeps amount and organization-safe source references machine readable", () => {
    expectTypeOf<FinancialSourceResolutionContract["amountMinor"]>().toEqualTypeOf<string>();
    expectTypeOf<FinancialSourceRefContract["resourceType"]>().toEqualTypeOf<
      "journal_line" | "journal_entry" | "commercial_document" | "expense" | "evidence"
    >();
    expectTypeOf<FinancialStatementDrilldownItemContract["refs"]>().toEqualTypeOf<
      readonly FinancialSourceRefContract[]
    >();
  });
});
