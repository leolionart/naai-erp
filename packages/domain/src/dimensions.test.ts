import { describe, expect, it } from "vitest";
import {
  createDefaultMapping,
  createDimensionRule,
  createDimensionValue,
  validateAllocations,
  validateAmountAllocations,
  validateRequiredDimensions,
} from "./dimensions.js";

describe("ERP-120 dimensions and allocations", () => {
  const rule = createDimensionRule({
    organizationId: "org-naai",
    accountCode: "511",
    requiredKinds: ["client", "project", "service_line", "project"],
    effectiveFrom: "2026-01-01",
  });

  it("deduplicates and validates required dimension kinds", () => {
    expect(rule.requiredKinds).toEqual(["client", "project", "service_line"]);
    const values = [
      createDimensionValue({
        organizationId: "org-naai",
        kind: "client",
        code: "C01",
        name: "Client",
      }),
      createDimensionValue({
        organizationId: "org-naai",
        kind: "project",
        code: "P01",
        name: "Project",
      }),
      createDimensionValue({
        organizationId: "org-naai",
        kind: "service_line",
        code: "WEB",
        name: "Web",
      }),
    ];
    expect(() => validateRequiredDimensions(rule, values)).not.toThrow();
    expect(() => validateRequiredDimensions(rule, values.slice(0, 2))).toThrow("service_line");
  });

  it("rejects dimension values from another organization", () => {
    const foreign = createDimensionValue({
      organizationId: "org-other",
      kind: "client",
      code: "C01",
      name: "Client",
    });
    expect(() => validateRequiredDimensions(rule, [foreign])).toThrow("another organization");
  });

  it("requires allocations to total exactly one hundred percent", () => {
    expect(() =>
      validateAllocations([
        { dimensionKind: "project", dimensionCode: "P01", percentage: "60.000000" },
        { dimensionKind: "project", dimensionCode: "P02", percentage: "40" },
      ]),
    ).not.toThrow();
    expect(() =>
      validateAllocations([
        { dimensionKind: "project", dimensionCode: "P01", percentage: "60" },
        { dimensionKind: "project", dimensionCode: "P02", percentage: "39.999999" },
      ]),
    ).toThrow("exactly 100");
  });

  it("requires explicit metadata for rounding residuals", () => {
    expect(() =>
      validateAllocations([
        {
          dimensionKind: "project",
          dimensionCode: "P01",
          percentage: "100",
          roundingResidualMinor: 1n,
        },
      ]),
    ).toThrow("residual account");
  });

  it("supports exact minor-unit amount allocations", () => {
    expect(() =>
      validateAmountAllocations(1_000_000n, [
        { dimensionKind: "project", dimensionCode: "P01", amountMinor: 600_000n },
        { dimensionKind: "project", dimensionCode: "P02", amountMinor: 400_000n },
      ]),
    ).not.toThrow();
    expect(() =>
      validateAmountAllocations(1_000_000n, [
        { dimensionKind: "project", dimensionCode: "P01", amountMinor: 999_999n },
      ]),
    ).toThrow("source amount exactly");
  });

  it("creates versioned defaults and pins tax policy versions", () => {
    expect(
      createDefaultMapping({
        organizationId: "org-naai",
        categoryCode: "HOSTING",
        accountCode: "642",
        taxCode: "VAT-IN-10",
        taxEffectiveFrom: "2026-01-01",
        defaultCostCenterCode: "OPS",
        effectiveFrom: "2026-01-01",
      }).taxEffectiveFrom,
    ).toBe("2026-01-01");
    expect(() =>
      createDefaultMapping({
        organizationId: "org-naai",
        categoryCode: "HOSTING",
        accountCode: "642",
        taxCode: "VAT-IN-10",
        effectiveFrom: "2026-01-01",
      }),
    ).toThrow("both code and version");
  });
});
