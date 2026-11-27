export type MovementType =
  | "owner_paid_company_cost"
  | "owner_custody_cash"
  | "owner_personal_withdrawal"
  | "owner_funding"
  | "owner_repayment";

export type OwnerCurrentMovement = Readonly<{
  journalId: string;
  date: string;
  description: string;
  currency: string;
  state: string;
  movementType?: MovementType;
  proposedMovementType?: "company_repayment_to_owner" | null;
  reviewReason?: string;
  ownerDeltaMinor: string;
  companyFundsDeltaMinor: string;
  runningOwnerBalanceMinor?: string;
  ownerAccountCodes: readonly string[];
  needsReview: boolean;
  classificationBasis?: string | null;
  settlementDeltaMinor?: string;
  runningConfirmedSettlementBalanceMinor?: string;
  sources: readonly Readonly<{
    sourceType: "expense" | "purchase_invoice";
    sourceId: string;
    title: string;
    detail: string | null;
    sourceHref: string;
    expenseClass: string | null;
    category: string | null;
    citState: string | null;
    vatState: string | null;
    grossMinor: string;
    payeeName: string | null;
  }>[];
}>;

export type OwnerCurrentResponse = Readonly<{
  summary: Readonly<{
    statutoryOwnerCurrentBalanceMinor: string;
    confirmedSettlementBalanceMinor: string;
    companyOwesOwnerMinor: string;
    ownerHoldsCompanyFundsMinor: string;
    ownerPaidCompanyCostMinor: string;
    ownerCustodyCashMinor: string;
    ownerPersonalWithdrawalMinor: string;
    ownerFundingMinor: string;
    reviewMinor: string;
    reviewCount: number;
  }>;
  confirmedTimeline: readonly OwnerCurrentMovement[];
  reviewItems: readonly OwnerCurrentMovement[];
}>;

export type FinancialAccount = Readonly<{
  id: string;
  display_name?: string;
  displayName?: string;
  currency: string;
  status: "active" | "inactive";
}>;
