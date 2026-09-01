export type OperatingDashboardOwnerSettlementContract = Readonly<{
  /** Canonical shared-ledger money total, counted once. */
  cashAndBankMinor?: string;
  /** Physical company funds including owner-held custody, without overlap. */
  totalCompanyFundsMinor?: string;
  /** Difference between canonical ledger and physical partition; non-zero means provenance gap. */
  companyFundsReconciliationGapMinor?: string;
  companyOwesOwnerMinor: string;
  ownerHoldsCompanyFundsMinor: string;
  statutoryOwnerCurrentBalanceMinor: string;
  ownerSettlementDrilldownHref: string;
}>;
