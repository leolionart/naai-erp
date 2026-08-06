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
    expect(findNavigationItem("ledger")?.href).toBe("/accounting/journals");
    expect(isNavigationAvailable(findNavigationItem("ledger")!)).toBe(true);
    expect(findNavigationItem("banking")?.href).toBe("/banking");
    expect(isNavigationAvailable(findNavigationItem("banking")!)).toBe(true);
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
    for (const hidden of [
      "evidence",
      "integrations",
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
