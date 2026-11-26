export const CIT_POLICY_CONTRACT_VERSION = "v1" as const;

export type CitRateBasisContract =
  | "prior_year_revenue"
  | "declared_prior_year_revenue"
  | "no_prior_year_revenue"
  | "ineligible_override"
  | "tax_code_policy"
  | "unconfigured";

export type CitRateTierContract = Readonly<{
  tierOrder: number;
  tierCode: string;
  label: string;
  maxRevenueMinor: string | null;
  rateBps: number;
}>;

export type CitRateScheduleContract = Readonly<{
  effectiveFromYear: number;
  effectiveToYear: number | null;
  lawReference: string;
  standardRateBps: number;
  source: "statutory" | "organization";
  version?: string;
  tiers: readonly CitRateTierContract[];
}>;

export type OrganizationCitPolicyContract = Readonly<{
  organizationId: string;
  citSmallEnterpriseIneligible: boolean;
  ineligibilityReason: string | null;
  priorYearRevenueOverrideMinor: string | null;
  version: string;
  updatedBy: string | null;
  updatedAt: string | null;
  organizationSchedules: readonly CitRateScheduleContract[];
  statutorySchedules: readonly CitRateScheduleContract[];
  effectiveSchedule?: CitRateScheduleContract | null;
}>;

export type UpdateOrganizationCitPolicyRequest = Readonly<{
  citSmallEnterpriseIneligible: boolean;
  ineligibilityReason?: string | null;
  priorYearRevenueOverrideMinor?: string | null;
  reason: string;
}>;

export type UpsertOrganizationCitRateTiersRequest = Readonly<{
  effectiveToYear?: number | null;
  lawReference?: string;
  tiers: readonly Readonly<{
    tierCode: string;
    label: string;
    maxRevenueMinor: string | null;
    rateBps: number;
  }>[];
  reason: string;
}>;

export type EstimatedCitReportContract = Readonly<{
  formulaVersion: "estimated-cit-v1";
  organizationId: string;
  currency: string;
  startsOn: string;
  endsOn: string;
  taxYear: number;
  priorYear: number;
  status: "ready" | "review_required";
  accountingRevenueMinor: string;
  accountingExpenseMinor: string;
  accountingProfitBeforeTaxMinor: string;
  citIneligibleMinor: string;
  citUnreviewedMinor: string;
  taxableProfitMinor: string;
  taxableBaseMinor: string;
  effectiveRateBps: number | null;
  corporateIncomeTaxRateBps: number | null;
  estimatedCitMinor: string | null;
  tierCode: string | null;
  basis: CitRateBasisContract;
  assumption: string;
  lawReference: string | null;
  scheduleSource: "statutory" | "organization" | null;
  referenceRevenueMinor: string | null;
  priorYearLedgerRevenueMinor: string;
  hasPriorYearActivity: boolean;
  currentYearRevenueMinor: string;
  citSmallEnterpriseIneligible: boolean;
  ineligibilityReason: string | null;
  priorYearRevenueOverrideMinor: string | null;
  tiers: readonly CitRateTierContract[];
}>;
