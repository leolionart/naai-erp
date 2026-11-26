export const FUNDING_PLAN_MAX_ITEMS = 200;

export type FundingPlanKind = "expense" | "purchase_invoice";

export type FundingPlanExportRow = Readonly<{
  kind: FundingPlanKind;
  id: string;
  externalId: string;
  date: string;
  payee: string;
  description: string;
  grossMinor: string;
  currentFunding: string;
  currentAccount: string;
  targetFunding: string;
}>;

export type FundingPlanItemInput = Readonly<{
  kind: FundingPlanKind;
  id: string;
  targetFunding: string;
  reason?: string;
}>;

export type FundingPlanDryRunRequest = Readonly<{
  items: readonly FundingPlanItemInput[];
  reason?: string;
}>;

export type FundingPlanCommitRequest = Readonly<{
  planHash: string;
  items: readonly FundingPlanItemInput[];
  reason?: string;
  postReplacement?: boolean;
}>;

export type FundingPlanDashboardImpact = Readonly<{
  ownerDebtDeltaMinor: string;
  ownerCustodyDeltaMinor: string;
  companyCashDeltaMinor: string;
  companyBankDeltaMinor: string;
}>;

export type FundingPlanPreviewItem = Readonly<{
  kind: FundingPlanKind;
  id: string;
  version: string;
  targetFunding: string;
  status: "ready" | "blocked";
  blockedReason?: string;
  beforeAccount?: string;
  afterAccount?: string;
  targetFinancialAccountId?: string;
  grossMinor?: string;
}>;
