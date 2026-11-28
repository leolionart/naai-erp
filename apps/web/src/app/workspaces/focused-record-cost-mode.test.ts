import { describe, expect, it } from "vitest";
import {
  EXPENSE_COST_MODE_OPTIONS,
  extractCategoryCatalog,
  matchesExpenseCostMode,
  parseExpenseCostMode,
  summarizeFilteredExpenseAmounts,
} from "./focused-record-cost-mode";
import { tagRow } from "./focused-record-shared";

describe("ERP-1005 expense cost-mode quick filter and summary", () => {
  const catalog = extractCategoryCatalog([
    [
      { code: "SALARY", name: "Lương & Nhân sự", funding_treatment: "owner_paid_company_cost" },
      {
        code: "ACCOUNTING_SERVICES",
        name: "Dịch vụ kế toán - thuế",
        funding_treatment: "owner_paid_company_cost",
      },
      {
        code: "DOMAIN_HOSTING",
        name: "Tên miền & Hosting",
        funding_treatment: "owner_paid_company_cost",
      },
      {
        code: "SERVER_CLOUD",
        name: "Máy chủ & Đám mây",
        funding_treatment: "owner_paid_company_cost",
      },
      { code: "TAX", name: "Thuế & Lệ phí", funding_treatment: "company_funds" },
      { code: "MEAL", name: "Tiếp khách & Ăn uống", funding_treatment: "tax_only_non_cash" },
      {
        code: "ELECTRICITY_WATER",
        name: "Điện & Nước",
        funding_treatment: "tax_only_non_cash",
      },
      {
        code: "LEGACY_DISABLED",
        name: "Danh mục ngừng dùng",
        is_active: false,
        funding_treatment: "owner_paid_company_cost",
      },
    ],
  ]);

  it("parses URL costMode safely and exposes canonical quick-select options", () => {
    expect(parseExpenseCostMode(null)).toBe("all");
    expect(parseExpenseCostMode("invalid")).toBe("all");
    expect(parseExpenseCostMode("company_real")).toBe("company_real");
    expect(parseExpenseCostMode("tax_only")).toBe("tax_only");
    expect(EXPENSE_COST_MODE_OPTIONS.map((item) => item.value)).toEqual([
      "all",
      "company_real",
      "tax_only",
    ]);
  });

  it("extracts active category names and funding treatments across responses", () => {
    expect(catalog.names.ACCOUNTING_SERVICES).toBe("Dịch vụ kế toán - thuế");
    expect(catalog.treatments.ACCOUNTING_SERVICES).toBe("owner_paid_company_cost");
    expect(catalog.treatments.MEAL).toBe("tax_only_non_cash");
    expect(catalog.treatments.LEGACY_DISABLED).toBeUndefined();
  });

  it("separates real company expenses from tax-only personal invoices across expenses and purchase invoices", () => {
    const bankExpense = tagRow(
      {
        id: "exp-bank",
        counter_account_code: "112-BANK",
        funding_financial_account_id: "fa-bank",
        category: "OTHER_EXPENSE",
        gross_minor: "7540780",
        state: "posted",
      },
      "expenses",
      "missing",
    );
    const custodyTaxExpense = tagRow(
      {
        id: "exp-custody",
        counter_account_code: "111-OWNER-CUSTODY",
        funding_financial_account_id: "cash-owner-custody",
        category: "TAX",
        gross_minor: "32118065",
        state: "posted",
      },
      "expenses",
      "missing",
    );
    const ownerPaidSalary = tagRow(
      {
        id: "exp-salary",
        counter_account_code: "3388-OWNER",
        category: "SALARY",
        gross_minor: "15000000",
        state: "posted",
      },
      "expenses",
      "missing",
    );
    const ownerPaidPurchaseInvoice = tagRow(
      {
        id: "doc-accounting",
        type: "purchase_invoice",
        control_account_code: "3388-OWNER",
        lines: [{ category_code: "ACCOUNTING_SERVICES" }],
        gross_minor: "1620000",
        state: "posted",
      },
      "documents",
      "present",
    );
    const taxOnlyMealInvoice = tagRow(
      {
        id: "doc-meal",
        type: "purchase_invoice",
        control_account_code: "3388-OWNER",
        category: "MEAL",
        gross_minor: "2400000",
        state: "posted",
      },
      "documents",
      "present",
    );
    const uncategorizedOwnerRow = tagRow(
      {
        id: "exp-uncat",
        counter_account_code: "3388-OWNER",
        gross_minor: "500000",
        state: "posted",
      },
      "expenses",
      "missing",
    );

    const realRows = [bankExpense, custodyTaxExpense, ownerPaidSalary, ownerPaidPurchaseInvoice];
    for (const row of realRows) {
      expect(matchesExpenseCostMode(row, "all", catalog.treatments)).toBe(true);
      expect(matchesExpenseCostMode(row, "company_real", catalog.treatments)).toBe(true);
      expect(matchesExpenseCostMode(row, "tax_only", catalog.treatments)).toBe(false);
    }

    for (const row of [taxOnlyMealInvoice, uncategorizedOwnerRow]) {
      expect(matchesExpenseCostMode(row, "all", catalog.treatments)).toBe(true);
      expect(matchesExpenseCostMode(row, "company_real", catalog.treatments)).toBe(false);
      expect(matchesExpenseCostMode(row, "tax_only", catalog.treatments)).toBe(true);
    }
  });

  it("sums posted and active totals while excluding cancelled, reversed, and rejected rows", () => {
    const summary = summarizeFilteredExpenseAmounts([
      { id: "1", state: "posted", gross_minor: "15000000" },
      { id: "2", state: "approved", gross_minor: "10000000" },
      { id: "3", state: "reversed", gross_minor: "99999999" },
      { id: "4", state: "cancelled", gross_minor: "88888888" },
    ]);
    expect(summary.postedMinor).toBe(15000000n);
    expect(summary.totalMinor).toBe(25000000n);
  });
});
