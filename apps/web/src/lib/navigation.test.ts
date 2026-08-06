import { describe, expect, it } from "vitest";
import { adminNavigation, findNavigationItem, isNavigationAvailable } from "./navigation";

describe("typed admin navigation", () => {
  it("keeps unique group and item keys", () => {
    expect(new Set(adminNavigation.map((group) => group.key)).size).toBe(adminNavigation.length);
    const items = adminNavigation.reduce<Array<{ key: string }>>(
      (all, group) => [...all, ...group.items],
      [],
    );
    expect(new Set(items.map((item) => item.key)).size).toBe(items.length);
  });

  it("exposes only the narrowed MVP destinations", () => {
    expect(findNavigationItem("overview")?.href).toBe("/dashboard");
    expect(findNavigationItem("documents")?.href).toBe("/documents");
    expect(findNavigationItem("expenses")?.href).toBe("/expenses");
    expect(findNavigationItem("performance")?.href).toBe("/reports/performance");
    expect(isNavigationAvailable(findNavigationItem("performance")!)).toBe(true);
    expect(findNavigationItem("financial-statements")?.href).toBe("/reports/financial-statements");
    expect(isNavigationAvailable(findNavigationItem("financial-statements")!)).toBe(true);
    expect(findNavigationItem("receivables")?.href).toBe("/receivables");
    expect(findNavigationItem("payables")?.href).toBe("/payables");
    expect(findNavigationItem("accountant-exports")?.href).toBe("/reports/accountant-exports");
    expect(isNavigationAvailable(findNavigationItem("accountant-exports")!)).toBe(true);
    expect(findNavigationItem("customers")?.href).toBe("/customers");
    expect(findNavigationItem("projects")?.href).toBe("/projects");
    expect(findNavigationItem("import-review")?.href).toBe("/imports/review");
    for (const hidden of [
      "evidence",
      "integrations",
      "master-data",
      "ledger",
      "banking",
      "timesheets",
      "cost-rates",
      "project-costs",
      "project-revenue",
      "overhead",
      "forecast",
      "forecast-composition",
      "reports",
      "executive-metrics",
    ]) {
      expect(findNavigationItem(hidden)).toBeUndefined();
    }
    expect(findNavigationItem("missing")).toBeUndefined();
  });
});
