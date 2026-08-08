import { describe, expect, it, vi } from "vitest";
import { ExpenseService } from "./expense.service.js";
const context = {
  organizationId: "org-a",
  actorId: "finance",
  roles: ["finance_admin"],
  correlationId: "corr",
} as const;
const expense = {
  expenseClass: "non_documented",
  expenseDate: "2026-01-06",
  businessPurpose: "Office supplies",
  currency: "VND",
  netMinor: "3000000",
  vatMinor: "0",
  grossMinor: "3000000",
  counterAccountCode: "1111",
  lines: [
    {
      description: "Supplies",
      netMinor: "3000000",
      vatMinor: "0",
      grossMinor: "3000000",
      postingAccountCode: "642",
      vatState: "ineligible" as const,
      allocations: [{ id: "a", amountMinor: "3000000", dimensions: { costCenter: "ADMIN" } }],
    },
  ],
} as const;
describe("ERP-310 ExpenseService", () => {
  it("creates a non-invoice expense with VAT forced non-deductible", async () => {
    const store = { create: vi.fn().mockResolvedValue({ expenseId: "e-1", state: "draft" }) };
    const service = new ExpenseService(store as never, {} as never);
    expect((await service.create(context, expense, "idem")).data).toMatchObject({
      expenseId: "e-1",
    });
  });
  it("rejects VAT eligibility and allocation mismatch without an invoice", async () => {
    const service = new ExpenseService({} as never, {} as never);
    await expect(
      service.create(
        context,
        {
          ...expense,
          vatMinor: "100",
          grossMinor: "3000100",
          lines: [
            {
              ...expense.lines[0],
              vatMinor: "100",
              grossMinor: "3000100",
              vatAccountCode: "1331",
              vatState: "eligible",
            },
          ],
        },
        "idem",
      ),
    ).rejects.toThrow("VAT_EVIDENCE_REQUIRED");
    await expect(
      service.create(
        context,
        {
          ...expense,
          lines: [
            {
              ...expense.lines[0],
              allocations: [{ id: "a", amountMinor: "1", dimensions: { costCenter: "ADMIN" } }],
            },
          ],
        },
        "idem",
      ),
    ).rejects.toThrow("EXPENSE_ALLOCATION_MISMATCH");
  });
  it("requires employee for reimbursement and reference for override", async () => {
    const service = new ExpenseService({ review: vi.fn() } as never, {} as never);
    await expect(
      service.create(context, { ...expense, expenseClass: "employee_reimbursement" }, "idem"),
    ).rejects.toThrow("REIMBURSEMENT_EMPLOYEE_REQUIRED");
    await expect(
      service.review(
        context,
        "e-1",
        {
          axis: "vat",
          lineNumber: 1,
          state: "accountant_override",
          eligibleMinor: "0",
          reason: "Exception",
        },
        "idem",
      ),
    ).rejects.toThrow("ACCOUNTANT_OVERRIDE_REFERENCE_REQUIRED");
  });
  describe("update command", () => {
    it("successfully merges and updates a draft expense", async () => {
      const existing = {
        id: "e-1",
        expense_class: "non_documented",
        expense_date: "2026-01-06",
        business_purpose: "Office supplies",
        currency: "VND",
        net_minor: "3000000",
        vat_minor: "0",
        gross_minor: "3000000",
        counter_account_code: "1111",
        state: "draft",
        version: "1",
        lines: [
          {
            lineNumber: 1,
            description: "Supplies",
            netMinor: "3000000",
            vatMinor: "0",
            grossMinor: "3000000",
            postingAccountCode: "642",
            vatState: "ineligible",
            allocations: [
              { amount_minor: "3000000", dimensions: { allocationId: "a", costCenter: "ADMIN" } },
            ],
          },
        ],
        externalReference: {
          system: "sys-2",
          externalId: "ext-2",
        },
      };
      const store = {
        get: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue({ expenseId: "e-1", version: "2" }),
      };
      const service = new ExpenseService(store as never, {} as never);
      const input = {
        businessPurpose: "Office supplies revised",
      };
      const result = await service.update(context, "e-1", "1", input, "idem-3");
      expect(store.update).toHaveBeenCalledWith(
        context,
        "e-1",
        "1",
        expect.objectContaining({
          businessPurpose: "Office supplies revised",
          externalReference: expect.objectContaining({ system: "sys-2", externalId: "ext-2" }),
        }),
        "idem-3",
      );
      expect(result.data).toEqual({ expenseId: "e-1", version: "2" });
    });
    it("rejects update if not in draft state", async () => {
      const existing = {
        id: "e-1",
        state: "posted",
        version: "1",
      };
      const store = { get: vi.fn().mockResolvedValue(existing) };
      const service = new ExpenseService(store as never, {} as never);
      await expect(service.update(context, "e-1", "1", {}, "idem")).rejects.toThrow(
        "INVALID_STATE_TRANSITION",
      );
    });
    it("rejects update if version conflict occurs", async () => {
      const existing = {
        id: "e-1",
        state: "draft",
        version: "2",
      };
      const store = { get: vi.fn().mockResolvedValue(existing) };
      const service = new ExpenseService(store as never, {} as never);
      await expect(service.update(context, "e-1", "1", {}, "idem")).rejects.toThrow(
        "VERSION_CONFLICT",
      );
    });
    it("rejects update for unauthorized role", async () => {
      const service = new ExpenseService({} as never, {} as never);
      await expect(
        service.update({ ...context, roles: ["viewer"] }, "e-1", "1", {}, "idem"),
      ).rejects.toThrow("FORBIDDEN");
    });
  });
  describe("discard command", () => {
    it("delegates a versioned, reasoned draft discard", async () => {
      const store = {
        discard: vi.fn().mockResolvedValue({ expenseId: "e-1", state: "discarded" }),
      };
      const service = new ExpenseService(store as never, {} as never);
      const result = await service.discard(
        context,
        "e-1",
        "1",
        "Imported payroll was inferred",
        "idem",
      );
      expect(store.discard).toHaveBeenCalledWith(
        context,
        "e-1",
        "1",
        "Imported payroll was inferred",
        "idem",
      );
      expect(result.data).toMatchObject({ expenseId: "e-1", state: "discarded" });
    });

    it("requires write permission, version, reason and idempotency", async () => {
      const service = new ExpenseService({} as never, {} as never);
      await expect(
        service.discard({ ...context, roles: ["viewer"] }, "e-1", "1", "reason", "idem"),
      ).rejects.toThrow("FORBIDDEN");
      await expect(service.discard(context, "e-1", "", "reason", "idem")).rejects.toThrow(
        "VERSION_CONFLICT",
      );
      await expect(service.discard(context, "e-1", "1", "", "idem")).rejects.toThrow(
        "VALIDATION_FAILED",
      );
      await expect(service.discard(context, "e-1", "1", "reason")).rejects.toThrow(
        "IDEMPOTENCY_KEY_REQUIRED",
      );
    });
  });
  describe("category metadata command", () => {
    it("delegates an idempotent category-only update", async () => {
      const store = {
        updateCategory: vi.fn().mockResolvedValue({
          expenseId: "e-1",
          category: "MEAL",
          version: "3",
        }),
      };
      const service = new ExpenseService(store as never, {} as never);
      const result = await service.updateCategory(context, "e-1", { category: " MEAL " }, "cat-1");

      expect(store.updateCategory).toHaveBeenCalledWith(context, "e-1", "MEAL", "cat-1");
      expect(result.data).toMatchObject({ expenseId: "e-1", category: "MEAL", version: "3" });
    });

    it("requires write permission, a category and idempotency", async () => {
      const service = new ExpenseService({} as never, {} as never);
      await expect(
        service.updateCategory(
          { ...context, roles: ["viewer"] },
          "e-1",
          { category: "MEAL" },
          "cat-1",
        ),
      ).rejects.toThrow("FORBIDDEN");
      await expect(
        service.updateCategory(context, "e-1", { category: " " }, "cat-1"),
      ).rejects.toThrow("VALIDATION_FAILED");
      await expect(service.updateCategory(context, "e-1", { category: "MEAL" })).rejects.toThrow(
        "IDEMPOTENCY_KEY_REQUIRED",
      );
    });
  });
  it("delegates posted expense reverse_replace as one canonical store transaction", async () => {
    const store = {
      reverseReplace: vi.fn().mockResolvedValue({
        expenseId: "e-1",
        replacementExpenseId: "e-2",
        reversalJournalId: "jr-rev",
      }),
    };
    const service = new ExpenseService(store as never, {} as never);
    const result = await service.reverseReplace(
      context,
      "e-1",
      "4",
      { ...expense, id: "e-2" },
      "Correct posted expense",
      "replace-expense",
    );
    expect(store.reverseReplace).toHaveBeenCalledWith(
      context,
      "e-1",
      "4",
      expect.objectContaining({ id: "e-2" }),
      "Correct posted expense",
      "replace-expense",
    );
    expect(result.data).toMatchObject({ replacementExpenseId: "e-2" });
  });
});
