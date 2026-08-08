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
