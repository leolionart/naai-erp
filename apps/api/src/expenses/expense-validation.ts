import type { CreateExpenseInput } from "./expense.types.js";

export function validateExpensePayload(input: CreateExpenseInput) {
  if (
    !input.expenseClass?.trim() ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.expenseDate) ||
    !input.businessPurpose?.trim() ||
    !/^[A-Z]{3}$/.test(input.currency) ||
    !input.counterAccountCode?.trim() ||
    input.lines.length === 0
  )
    throw new Error("VALIDATION_FAILED");
  if (input.expenseClass === "employee_reimbursement" && !input.employeePartyId)
    throw new Error("REIMBURSEMENT_EMPLOYEE_REQUIRED");
  if (
    input.expenseClass === "freelancer" &&
    (!input.payeePartyId ||
      !input.freelanceDueDate ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.freelanceDueDate) ||
      input.freelanceDueDate < input.expenseDate ||
      !input.lines.some(
        (line) =>
          Boolean(line.dimensions?.projectId) ||
          line.allocations.some((allocation) => Boolean(allocation.dimensions.projectId)),
      ))
  )
    throw new Error("FREELANCE_EXPENSE_RELATIONSHIPS_REQUIRED");
  let net = 0n,
    vat = 0n,
    gross = 0n;
  for (const line of input.lines) {
    const lineNet = BigInt(line.netMinor),
      lineVat = BigInt(line.vatMinor),
      lineGross = BigInt(line.grossMinor);
    if (
      !line.description?.trim() ||
      !line.postingAccountCode?.trim() ||
      lineNet <= 0n ||
      lineVat < 0n ||
      lineGross !== lineNet + lineVat ||
      (lineVat > 0n && !line.vatAccountCode) ||
      (lineVat === 0n && line.vatAccountCode)
    )
      throw new Error("VALIDATION_FAILED");
    let allocated = 0n;
    const ids = new Set<string>();
    for (const allocation of line.allocations) {
      if (
        !allocation.id?.trim() ||
        ids.has(allocation.id) ||
        Object.keys(allocation.dimensions).length === 0
      )
        throw new Error("EXPENSE_ALLOCATION_INVALID");
      ids.add(allocation.id);
      const amount = BigInt(allocation.amountMinor);
      if (amount <= 0n) throw new Error("EXPENSE_ALLOCATION_INVALID");
      allocated += amount;
    }
    if (allocated !== lineNet) throw new Error("EXPENSE_ALLOCATION_MISMATCH");
    if (
      input.expenseClass === "non_documented" &&
      (lineVat !== 0n || ![undefined, "ineligible", "unreviewed"].includes(line.vatState))
    )
      throw new Error("VAT_EVIDENCE_REQUIRED");
    net += lineNet;
    vat += lineVat;
    gross += lineGross;
  }
  if (
    net !== BigInt(input.netMinor) ||
    vat !== BigInt(input.vatMinor) ||
    gross !== BigInt(input.grossMinor) ||
    gross !== net + vat
  )
    throw new Error("EXPENSE_CONTROL_TOTAL_MISMATCH");

  if (input.externalReference) {
    if (!input.externalReference.system?.trim() || !input.externalReference.externalId?.trim()) {
      throw new Error("VALIDATION_FAILED");
    }
  }
  if (input.funding) {
    if (
      (input.funding.type === "company_bank" || input.funding.type === "owner_custody_cash") &&
      !input.funding.financialAccountId?.trim()
    )
      throw new Error("FUNDING_FINANCIAL_ACCOUNT_REQUIRED");
    if (input.funding.type === "owner_paid" && input.funding.financialAccountId)
      throw new Error("FUNDING_FINANCIAL_ACCOUNT_NOT_ALLOWED");
    if (
      input.funding.type !== "company_bank" &&
      (input.funding.ownerFundingId || input.funding.ownerFundingTransactionId)
    )
      throw new Error("OWNER_FUNDING_ACCOUNT_MISMATCH");
  }
}
