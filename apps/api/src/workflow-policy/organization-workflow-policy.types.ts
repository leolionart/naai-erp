export type OrganizationOperatingMode = "controlled" | "solopreneur";

export type OrganizationWorkflowPolicy = Readonly<{
  operatingMode: OrganizationOperatingMode;
  allowSelfApproval: boolean;
  selfApprovalMaxMinor: bigint | null;
  nonCashThresholdMinor?: bigint;
}>;

export type OrganizationWorkflowCapabilities = Readonly<{
  operatingMode: OrganizationOperatingMode;
  ownerCanSelfApprove: boolean;
  requiresDistinctApprover: boolean;
  allowsBoundedSelfApproval: boolean;
  documentedTaxDefaultsFinal: boolean;
  nonCashThresholdMinor: string;
}>;

export type UpdateOrganizationWorkflowPolicyInput = Readonly<{
  operatingMode?: OrganizationOperatingMode;
  operating_mode?: OrganizationOperatingMode;
  allowSelfApproval?: boolean;
  allow_self_approval?: boolean;
  selfApprovalMaxMinor?: string | number | null;
  self_approval_max_minor?: string | number | null;
  nonCashThresholdMinor?: string | number;
  non_cash_threshold_minor?: string | number;
  reason?: string;
}>;

export type SelfApprovalDecisionInput = Readonly<{
  policy: OrganizationWorkflowPolicy;
  roles: readonly string[];
  amountMinor?: bigint;
}>;
