export type OrganizationOperatingMode = "controlled" | "solopreneur";

export type OrganizationWorkflowPolicy = Readonly<{
  operatingMode: OrganizationOperatingMode;
  allowSelfApproval: boolean;
  selfApprovalMaxMinor: bigint | null;
}>;

export type OrganizationWorkflowCapabilities = Readonly<{
  operatingMode: OrganizationOperatingMode;
  ownerCanSelfApprove: boolean;
  requiresDistinctApprover: boolean;
  allowsBoundedSelfApproval: boolean;
  documentedTaxDefaultsFinal: boolean;
}>;

export type SelfApprovalDecisionInput = Readonly<{
  policy: OrganizationWorkflowPolicy;
  roles: readonly string[];
  amountMinor?: bigint;
}>;
