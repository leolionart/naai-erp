export const FUNDING_CONTRACT_VERSION = 1 as const;

/** Canonical funding choices for expense and purchase-invoice writes. */
export type FundingTypeContract =
  "company_bank" | "company_cash" | "owner_paid" | "owner_custody_cash";

export type FundingInputContract = Readonly<{
  type: FundingTypeContract;
  /** Required for company_bank, company_cash and owner_custody_cash; omitted for owner_paid. */
  financialAccountId?: string;
}>;

export type FundingFieldErrorContract = Readonly<{
  field: string;
  message: string;
  expected?: readonly string[];
}>;

export type BusinessCorrectionRequestContract = Readonly<{
  category?: string;
  funding?: FundingInputContract;
  reason: string;
}>;

export type FundingRuleMatchContract = Readonly<{
  externalSystem?: string | null;
  supplierTaxId?: string | null;
  categoryCode?: string | null;
  keyword?: string | null;
  minAmountMinor?: string | null;
  maxAmountMinor?: string | null;
}>;

export type FundingRuleContract = Readonly<{
  id: string;
  name: string;
  priority: number;
  isActive: boolean;
  match: FundingRuleMatchContract;
  target: FundingInputContract;
  version: string;
  createdAt: string;
  updatedAt: string;
}>;

export type OrganizationFundingDefaultContract = Readonly<{
  defaultFunding: FundingInputContract;
  version: string;
  updatedAt?: string;
}>;
