export const FUNDING_CONTRACT_VERSION = 1 as const;

/** Canonical funding choices for expense and purchase-invoice writes. */
export type FundingTypeContract = "company_bank" | "owner_paid" | "owner_custody_cash";

export type FundingInputContract = Readonly<{
  type: FundingTypeContract;
  /** Required for company_bank and owner_custody_cash; omitted for owner_paid. */
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
