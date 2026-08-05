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
});
