export const REPORT_SNAPSHOT_CONTRACT_VERSION = 1 as const;
export type AccountantReportKindContract =
  | "profit_and_loss"
  | "balance_sheet"
  | "direct_cash_flow"
  | "vat_reconciliation"
  | "tax_expense_review";
export type SnapshotReadinessContract = "review_required" | "final";
export type SnapshotMappingContract = Readonly<{
  sourceKey: string;
  targetKey?: string;
  mappingVersionId?: string;
  status: "mapped" | "unmapped" | "review_required";
  reason?: string;
}>;
export type SnapshotUnresolvedItemContract = Readonly<{
  code: string;
  severity: "warning" | "critical";
  sourceIds: readonly string[];
  message: string;
}>;
export type ReportSnapshotContract = Readonly<{
  schemaVersion: typeof REPORT_SNAPSHOT_CONTRACT_VERSION;
  id: string;
  version: number;
  organizationId: string;
  reportKind: AccountantReportKindContract;
  period: Readonly<{ startsOn?: string; endsOn?: string; asOfDate: string }>;
  dimensions: Readonly<Record<string, string>>;
  accountingBasis: string;
  framework?: string;
  formulaVersions: Readonly<Record<string, string>>;
  mappingVersions: Readonly<Record<string, string>>;
  ledgerCutoff: Readonly<{
    throughDate: string;
    maxPostedAt: string;
    journalCount: number;
    lineCount: number;
    sourceFingerprint: string;
  }>;
  sourceManifest: readonly Readonly<Record<string, unknown>>[];
  mappings: readonly SnapshotMappingContract[];
  unresolvedItems: readonly SnapshotUnresolvedItemContract[];
  state: "captured";
  readiness: SnapshotReadinessContract;
  canonicalRequestJson: string;
  canonicalResultJson: string;
  requestHash: string;
  resultHash: string;
  snapshotHash: string;
  previousSnapshotId?: string;
  previousSnapshotVersion?: number;
  createdAt: string;
  createdBy: string;
}>;
export type CreateReportSnapshotRequest = Readonly<{
  reportKind: AccountantReportKindContract;
  period: Readonly<{ startsOn?: string; endsOn?: string; asOfDate: string }>;
  dimensions?: Readonly<Record<string, string>>;
  accountingBasis: string;
  framework?: string;
  formulaVersions: Readonly<Record<string, string>>;
  request: Readonly<Record<string, unknown>>;
}>;
export type SnapshotReproductionContract = Readonly<{
  requestHash: string;
  resultHash: string;
  requestMatches: boolean;
  resultMatches: boolean;
  reproducible: boolean;
}>;
