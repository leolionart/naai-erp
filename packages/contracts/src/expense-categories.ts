export const EXPENSE_CATEGORY_CONTRACT_VERSION = 1 as const;

export type ExpenseFundingTreatmentContract =
  "company_funds" | "owner_paid_company_cost" | "tax_only_non_cash";

export type ExpenseCategoryContract = Readonly<{
  organizationId: string;
  code: string;
  name: string;
  fundingTreatment: ExpenseFundingTreatmentContract;
  isActive: boolean;
  version: string;
}>;

export type OwnerPaidClassificationStatusContract = "ready" | "review_required" | "unconfigured";

export type ExpenseListQueryContract = Readonly<{
  state?: string;
  class?: string;
  payeePartyId?: string;
  fundingTreatment?: ExpenseFundingTreatmentContract;
}>;

export type ExpenseListItemProjectionContract = Readonly<{
  id: string;
  expense_date: string;
  gross_minor: string;
  category: string | null;
  /** Correction lineage; originals remain available for audit but are hidden by default. */
  originalExpenseId?: string | null;
  replacementExpenseId?: string | null;
  /** Effective line treatments after applying the legacy category fallback. */
  fundingTreatments: readonly ExpenseFundingTreatmentContract[];
  projectIds: readonly string[];
  contractIds: readonly string[];
}>;
