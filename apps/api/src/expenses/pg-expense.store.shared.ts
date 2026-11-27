export type StoredExpense = {
  id: string;
  expense_class: string;
  state: string;
  expense_date: string;
  freelance_due_date: string | null;
  currency: string;
  net_minor: string;
  vat_minor: string;
  gross_minor: string;
  counter_account_code: string;
  funding_financial_account_id: string | null;
  created_by: string;
  version: string;
  employee_party_id: string | null;
  payee_party_id: string | null;
  evidence_checklist: Record<string, boolean>;
};

/**
 * Derive CIT and VAT eligibility state from expense class at insert time.
 * Tax eligibility is independent from management booking and funding source.
 * Classes without business evidence start ineligible; every other class remains
 * unreviewed until the accountant records an evidence-backed decision.
 */
export function expenseClassToTaxState(
  expenseClass: string,
  operatingMode: string | null,
  vatMinor: string,
): { managementState: string; citState: string; vatState: string } {
  if (["non_documented", "owner_personal", "petty_cash"].includes(expenseClass))
    return { managementState: "invalid", citState: "ineligible", vatState: "ineligible" };
  if (operatingMode === "solopreneur")
    return {
      managementState: "valid",
      citState: "unreviewed",
      vatState: BigInt(vatMinor) > 0n ? "unreviewed" : "ineligible",
    };
  return { managementState: "unreviewed", citState: "unreviewed", vatState: "unreviewed" };
}

export const NEXT: Record<string, Record<string, string>> = {
  draft: { submit: "submitted" },
  submitted: {
    "mark-evidence-pending": "evidence_pending",
    approve: "approved",
    reject: "rejected",
  },
  evidence_pending: { submit: "submitted", reject: "rejected" },
  approved: { post: "posted" },
};
