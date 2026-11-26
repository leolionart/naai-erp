import { describe, expect, it, vi } from "vitest";
import {
  applyDocumentLineCategoryUpdate,
  applyExpenseLineCategoryUpdate,
  assertDocumentCategory,
  resolveExpenseCategory,
  type CategoryValidationQueryable,
} from "./canonical-category-validation.js";

describe("ERP-988 canonical category validation (BR-EDIT-001)", () => {
  it("resolves canonical expense_categories first with funding treatment without querying legacy dimensions", async () => {
    const query = vi.fn().mockResolvedValueOnce({
      rows: [
        { source: "expense", is_active: true, funding_treatment: "company_funds" },
        { source: "business", is_active: true, funding_treatment: null },
      ],
    });
    const client: CategoryValidationQueryable = { query };

    const result = await resolveExpenseCategory(client, "org-1", "OFFICE");
    expect(result).toEqual({ source: "expense", fundingTreatment: "company_funds" });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("accepts an active business_categories(kind='expense') entry when expense_categories has no row", async () => {
    const query = vi.fn().mockResolvedValueOnce({
      rows: [{ source: "business", is_active: true, funding_treatment: null }],
    });
    const client: CategoryValidationQueryable = { query };

    const result = await resolveExpenseCategory(client, "org-1", "CLOUD_TOOLS");
    expect(result).toEqual({ source: "business", fundingTreatment: null });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("rejects a deactivated canonical expense category even if legacy dimension_values has it active", async () => {
    const query = vi.fn().mockResolvedValueOnce({
      rows: [{ source: "expense", is_active: false, funding_treatment: "company_funds" }],
    });
    const client: CategoryValidationQueryable = { query };

    await expect(resolveExpenseCategory(client, "org-1", "OLD_CAT")).rejects.toThrow(
      "CATEGORY_NOT_FOUND",
    );
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("falls back to legacy dimension_values(kind='category') only when absent from canonical catalogs", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ok: 1 }] });
    const client: CategoryValidationQueryable = { query };

    const result = await resolveExpenseCategory(client, "org-1", "LEGACY_MEAL");
    expect(result).toEqual({ source: "legacy", fundingTreatment: null });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("updates expense_lines canonical columns or clears category cleanly", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const client: CategoryValidationQueryable = { query };

    await applyExpenseLineCategoryUpdate(client, "org-1", "exp-1", "OFFICE", {
      source: "expense",
      fundingTreatment: "company_funds",
    });
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining("set expense_category_code = $3"),
      ["org-1", "exp-1", "OFFICE", "company_funds"],
    );

    await applyExpenseLineCategoryUpdate(client, "org-1", "exp-1", null);
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining("set expense_category_code = null"),
      ["org-1", "exp-1"],
    );
  });

  it("validates commercial document categories against canonical catalogs first and legacy dimensions only as fallback", async () => {
    const purchaseQuery = vi.fn().mockResolvedValueOnce({
      rows: [{ is_active: true }],
    });
    await expect(
      assertDocumentCategory({ query: purchaseQuery }, "org-1", "purchase_invoice", "OFFICE"),
    ).resolves.toBeUndefined();
    expect(purchaseQuery).toHaveBeenCalledTimes(1);

    const salesLegacyQuery = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ok: 1 }] });
    await expect(
      assertDocumentCategory({ query: salesLegacyQuery }, "org-1", "sales_invoice", "LEGACY_REV"),
    ).resolves.toBeUndefined();
    expect(salesLegacyQuery).toHaveBeenCalledTimes(2);

    const inactiveCanonicalQuery = vi.fn().mockResolvedValueOnce({
      rows: [{ is_active: false }],
    });
    await expect(
      assertDocumentCategory(
        { query: inactiveCanonicalQuery },
        "org-1",
        "sales_invoice",
        "INACTIVE_REV",
      ),
    ).rejects.toThrow("CATEGORY_NOT_FOUND");
    expect(inactiveCanonicalQuery).toHaveBeenCalledTimes(1);

    const lineUpdateQuery = vi.fn().mockResolvedValue({ rows: [] });
    await applyDocumentLineCategoryUpdate({ query: lineUpdateQuery }, "org-1", "doc-1", "SERVICE");
    expect(lineUpdateQuery).toHaveBeenCalledWith(
      expect.stringContaining("set category_code = $3"),
      ["org-1", "doc-1", "SERVICE"],
    );
  });
});
