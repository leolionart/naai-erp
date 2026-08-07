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
    expect(findNavigationItem("documents")?.href).toBeUndefined();
    expect(findNavigationItem("sales-documents")?.href).toBe("/documents?type=sales_invoice");
    expect(findNavigationItem("purchase-documents")?.href).toBe("/documents?type=purchase_invoice");
    expect(findNavigationItem("expenses")).toBeUndefined();
    expect(findNavigationItem("financial-statements")?.href).toBeUndefined();
    expect(isNavigationAvailable(findNavigationItem("financial-statements")!)).toBe(true);
    expect(findNavigationItem("profit-and-loss")?.href).toContain("profit-and-loss");
    expect(findNavigationItem("vat-reconciliation")?.href).toContain("vat-reconciliation");
    expect(findNavigationItem("tax-expense-review")?.href).toBe("/reports/tax/expense-exceptions");
    expect(findNavigationItem("receivables")?.href).toBe("/receivables");
    expect(findNavigationItem("payables")?.href).toBe("/payables");
    expect(findNavigationItem("debt")?.href).toBeUndefined();
    expect(findNavigationItem("master-data")?.href).toBe("/settings/master-data");
    expect(findNavigationItem("accountant-exports")?.href).toBe("/reports/accountant-exports");
    expect(findNavigationItem("executive-metrics")?.href).toBe("/reports/executive-metrics");
    expect(findNavigationItem("customers")?.href).toBe("/customers");
    expect(findNavigationItem("projects")?.href).toBe("/projects");
    for (const hidden of [
      "import-review",
      "performance",
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
    ]) {
      expect(findNavigationItem(hidden)).toBeUndefined();
    }
    expect(findNavigationItem("missing")).toBeUndefined();
  });
});
