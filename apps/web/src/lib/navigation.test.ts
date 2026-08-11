import { describe, expect, it } from "vitest";
import { adminNavigation, findNavigationItem, isNavigationAvailable } from "./navigation";

describe("typed admin navigation", () => {
  it("keeps unique keys across groups, parents and submenu destinations", () => {
    expect(new Set(adminNavigation.map((group) => group.key)).size).toBe(adminNavigation.length);
    const keys = adminNavigation.flatMap((group) =>
      group.items.flatMap((item) => [
        item.key,
        ...("children" in item ? item.children.map((child) => child.key) : []),
      ]),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("exposes only the narrowed MVP destinations", () => {
    expect(findNavigationItem("overview")?.href).toBe("/dashboard");
    expect(findNavigationItem("documents")?.href).toBeUndefined();
    expect(findNavigationItem("sales-documents")?.href).toBe("/documents");
    expect(findNavigationItem("purchase-documents")?.href).toBe("/expenses");
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
    expect(findNavigationItem("purchase-products")?.href).toBe("/settings/purchase-products");
    expect(findNavigationItem("accountant-exports")?.href).toBe("/reports/accountant-exports");
    expect(findNavigationItem("portable-data-package")?.href).toBe("/settings/data-package");
    expect(findNavigationItem("executive-metrics")?.href).toBe("/reports/executive-metrics");
    expect(findNavigationItem("customer-subscriptions")?.href).toBe("/subscriptions");
    expect(findNavigationItem("owner-current")?.href).toBe("/banking/owner-current");
    expect(findNavigationItem("expense-reports")?.href).toBeUndefined();
    expect(findNavigationItem("expense-by-payee")?.href).toBe("/reports/expenses/by-payee");
    expect(findNavigationItem("expense-by-category")?.href).toBe("/reports/expenses/by-category");
    expect(findNavigationItem("customers")?.href).toBe("/customers");
    expect(findNavigationItem("projects")?.href).toBe("/projects");
    expect(findNavigationItem("planning")?.href).toBeUndefined();
    expect(findNavigationItem("revenue-targets")?.href).toBe("/forecast/targets");
    expect(findNavigationItem("forecast-scenarios")?.href).toBe("/forecast/scenarios");
    expect(findNavigationItem("forecast-composition")?.href).toBe("/forecast/composition");
    expect(findNavigationItem("time-management")).toBeUndefined();
    expect(findNavigationItem("timesheets")).toBeUndefined();
    expect(findNavigationItem("timesheet-approvals")).toBeUndefined();
    expect(findNavigationItem("new-timesheet")).toBeUndefined();
    expect(findNavigationItem("cost-rates")).toBeUndefined();
    expect(findNavigationItem("overhead")).toBeUndefined();
    expect(findNavigationItem("overhead-policies")).toBeUndefined();
    expect(findNavigationItem("overhead-pools")).toBeUndefined();
    expect(findNavigationItem("overhead-runs")).toBeUndefined();
    for (const hidden of [
      "import-review",
      "performance",
      "evidence",
      "integrations",
      "project-costs",
      "project-revenue",
      "forecast",
      "reports",
    ]) {
      expect(findNavigationItem(hidden)).toBeUndefined();
    }
    expect(findNavigationItem("missing")).toBeUndefined();
  });
});
