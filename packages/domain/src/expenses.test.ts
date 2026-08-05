import { describe, expect, it } from "vitest";
import {
  createExpense,
  generateExpenseBookingJournalDraft,
  generateReimbursementPaymentJournalDraft,
  reviewExpenseAxis,
  transitionExpense,
  updateExpenseEvidence,
} from "./expenses.js";
import { journalTotals } from "./journal.js";

function readyExpense(overrides: Partial<Parameters<typeof createExpense>[0]> = {}) {
  let expense = createExpense({
    organizationId: "org-naai",
    id: "expense-1",
    expenseClass: "invoice_backed",
    businessPurpose: "Project hosting",
    payeeId: "supplier-1",
    expenseDate: "2026-08-05",
    currency: "VND",
    netMinor: 1_000_000n,
    vatMinor: 100_000n,
    treatment: "operating_expense",
    dimensions: { projectId: "project-1", taxCode: "VAT10" },
    evidence: { invoice: true, payment: true },
    ...overrides,
  });
  expense = reviewExpenseAxis(expense, {
    axis: "accounting",
    state: "eligible",
    reviewerId: "accountant",
    reviewedAt: "2026-08-05T01:00:00Z",
  });
  expense = transitionExpense(expense, { next: "submitted" });
  expense = transitionExpense(expense, { next: "evidence_pending" });
  return transitionExpense(expense, { next: "approved", approverId: "approver" });
}

const accounts = {
  journalId: "expense-journal",
  expenseAccountId: "expense",
  prepaidAccountId: "prepaid",
  fixedAssetAccountId: "fixed-asset",
  ownerDrawAccountId: "owner-draw",
  taxAccountId: "tax",
  vatInputAccountId: "vat-input",
  companySettlementAccountId: "bank",
  employeePayableAccountId: "employee-payable",
};

describe("ERP-310 expense aggregate", () => {
  it("models evidence completeness and blocks approval until required evidence exists", () => {
    let expense = createExpense({
      organizationId: "org-naai",
      id: "e1",
      expenseClass: "receipt_backed",
      businessPurpose: "Client meeting",
      payeeId: "merchant",
      expenseDate: "2026-08-05",
      currency: "VND",
      netMinor: 500n,
      treatment: "operating_expense",
    });
    expect(expense.missingEvidence).toEqual(["receipt", "payment"]);
    expense = reviewExpenseAxis(expense, {
      axis: "accounting",
      state: "eligible",
      reviewerId: "accountant",
      reviewedAt: "2026-08-05T01:00:00Z",
    });
    expense = transitionExpense(transitionExpense(expense, { next: "submitted" }), {
      next: "evidence_pending",
    });
    expect(() => transitionExpense(expense, { next: "approved", approverId: "owner" })).toThrow(
      "evidence is incomplete",
    );
    expense = updateExpenseEvidence(expense, { receipt: true, payment: true });
    expect(transitionExpense(expense, { next: "approved", approverId: "owner" }).state).toBe(
      "approved",
    );
  });

  it("keeps accounting, CIT and VAT reviews independent and controls overrides", () => {
    let expense = createExpense({
      organizationId: "org-naai",
      id: "e1",
      expenseClass: "invoice_backed",
      businessPurpose: "Tool",
      payeeId: "vendor",
      expenseDate: "2026-08-05",
      currency: "VND",
      netMinor: 100n,
      vatMinor: 10n,
      treatment: "operating_expense",
    });
    expense = reviewExpenseAxis(expense, {
      axis: "accounting",
      state: "eligible",
      reviewerId: "a",
      reviewedAt: "2026-08-05T01:00:00Z",
    });
    expense = reviewExpenseAxis(expense, {
      axis: "cit",
      state: "ineligible",
      reviewerId: "a",
      reviewedAt: "2026-08-05T01:00:00Z",
    });
    expect(expense).toMatchObject({
      accountingReview: { state: "eligible" },
      citReview: { state: "ineligible" },
      vatReview: { state: "unreviewed" },
    });
    expect(() =>
      reviewExpenseAxis(expense, {
        axis: "vat",
        state: "accountant_override",
        reviewerId: "a",
        reviewedAt: "2026-08-05T01:00:00Z",
      }),
    ).toThrow("requires reason and reference");
    expect(() =>
      reviewExpenseAxis(expense, {
        axis: "vat",
        state: "partially_eligible",
        reviewerId: "a",
        reviewedAt: "2026-08-05T01:00:00Z",
      }),
    ).toThrow("Partial eligibility requires");
  });

  it("books non-invoice expense for management while VAT remains ineligible", () => {
    const expense = readyExpense({
      expenseClass: "non_documented",
      vatMinor: 100n,
      evidence: { payment: true },
    });
    expect(expense.vatReview.state).toBe("ineligible");
    const journal = generateExpenseBookingJournalDraft(expense, accounts);
    expect(journalTotals(journal)).toEqual({ debitMinor: 1_000_100n, creditMinor: 1_000_100n });
    expect(journal.lines.some((line) => line.accountId === "vat-input")).toBe(false);
  });

  it("separates employee reimbursement booking from its later cash payment", () => {
    let expense = readyExpense({
      expenseClass: "employee_reimbursement",
      employeeId: "employee-1",
      paymentSource: "employee",
      vatMinor: 0n,
      evidence: { payment: true },
    });
    const booking = generateExpenseBookingJournalDraft(expense, accounts);
    expect(booking.lines.at(-1)).toMatchObject({
      accountId: "employee-payable",
      creditMinor: 1_000_000n,
    });
    expense = transitionExpense(expense, { next: "posted" });
    const payment = generateReimbursementPaymentJournalDraft(expense, {
      journalId: "reimbursement-payment",
      employeePayableAccountId: "employee-payable",
      bankAccountId: "bank",
      paymentDate: "2026-08-06",
    });
    expect(payment.lines).toEqual([
      expect.objectContaining({ accountId: "employee-payable", debitMinor: 1_000_000n }),
      expect.objectContaining({ accountId: "bank", creditMinor: 1_000_000n }),
    ]);
  });

  it("enforces prepaid and capital treatment independently from document class", () => {
    expect(() =>
      createExpense({
        organizationId: "org-naai",
        id: "prepaid",
        expenseClass: "prepaid",
        businessPurpose: "Annual software",
        payeeId: "vendor",
        expenseDate: "2026-08-05",
        currency: "VND",
        netMinor: 1_000n,
        treatment: "operating_expense",
      }),
    ).toThrow("prepaid asset treatment");
    const prepaid = readyExpense({
      expenseClass: "prepaid",
      treatment: "prepaid_asset",
      vatMinor: 0n,
      evidence: { contract: true, payment: true },
    });
    expect(generateExpenseBookingJournalDraft(prepaid, accounts).lines[0]!.accountId).toBe(
      "prepaid",
    );
    const asset = readyExpense({
      expenseClass: "fixed_asset",
      treatment: "fixed_asset",
      vatMinor: 0n,
      evidence: { invoice: true, payment: true },
    });
    expect(generateExpenseBookingJournalDraft(asset, accounts).lines[0]!.accountId).toBe(
      "fixed-asset",
    );
  });
});
