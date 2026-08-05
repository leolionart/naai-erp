export type StatementSessionState = "open" | "closed";

export type StatementSessionContract = Readonly<{
  id: string;
  financialAccountId: string;
  periodStart: string;
  periodEnd: string;
  openingBalanceMinor: string;
  closingBalanceMinor: string;
  currency: string;
  state: StatementSessionState;
  resourceVersion: string;
  createdBy?: string;
  closedBy?: string;
  closedAt?: string;
  closeReason?: string;
}>;

export type StatementImportDisposition = Readonly<{
  importId: string;
  sourceFilename?: string;
  rowCount: string;
  importedCount: string;
  duplicateCount: string;
  rejectedCount: string;
}>;

export type StatementExceptionContract = Readonly<{
  id: string;
  kind: "suspense" | "control";
  bankTransactionId?: string;
  amountMinor: string;
  currency: string;
  ownerId: string;
  reason: string;
  reviewDue: string;
  status: "open" | "approved" | "resolved" | "rejected";
  resourceVersion: string;
  approvedBy?: string;
  approvedAt?: string;
  approvalReason?: string;
}>;

export type StatementSessionControl = Readonly<{
  balance: Readonly<{
    openingBalanceMinor: string;
    statementMovementMinor: string;
    expectedClosingMinor: string;
    reportedClosingMinor: string;
    differenceMinor: string;
    passed: boolean;
  }>;
  importDispositions: Readonly<{
    rowCount: string;
    importedCount: string;
    duplicateCount: string;
    rejectedCount: string;
    actualRowCount: string;
    passed: boolean;
  }>;
  coverage: Readonly<{
    transactionCount: number;
    reconciledCount: number;
    ignoredCount: number;
    exceptionCoveredCount: number;
    uncoveredTransactionIds: readonly string[];
    passed: boolean;
  }>;
  ledgerTie: Readonly<{
    statementMovementMinor: string;
    ledgerAccountCode: string;
    postedLedgerMovementMinor: string;
    differenceMinor: string;
    passed: boolean;
  }>;
  suspense: Readonly<{
    suspenseCount: number;
    unapprovedCount: number;
    unapprovedAmountMinor: string;
    passed: boolean;
  }>;
  canClose: boolean;
  blockingCodes: readonly string[];
}>;

export type StatementSessionDetailContract = Readonly<{
  session: StatementSessionContract;
  imports: readonly StatementImportDisposition[];
  exceptions: readonly StatementExceptionContract[];
  control: StatementSessionControl;
}>;

export type CreateStatementSessionRequest = CreateBankStatementSessionRequest;
export type CloseStatementSessionRequest = CloseBankStatementSessionRequest;

export type ReviewStatementExceptionRequest = Readonly<{
  schemaVersion: 1;
  expectedResourceVersion: string;
  reason: string;
  resolutionReference?: string;
}>;
export type ApproveStatementExceptionBody = ApproveStatementExceptionRequest;
export type ResolveStatementExceptionBody = ResolveStatementExceptionRequest;
export type RejectStatementExceptionBody = RejectStatementExceptionRequest;

export const statementSessionApi = Object.freeze({
  list: "banking/statement-sessions",
  detail(sessionId: string) {
    return `banking/statement-sessions/${encodeURIComponent(sessionId)}`;
  },
  close(sessionId: string) {
    return `${this.detail(sessionId)}/close`;
  },
  exceptions(sessionId: string) {
    return `${this.detail(sessionId)}/exceptions`;
  },
  reviewException(
    sessionId: string,
    exceptionId: string,
    action: "approve" | "resolve" | "reject",
  ) {
    return `${this.exceptions(sessionId)}/${encodeURIComponent(exceptionId)}/${action}`;
  },
});
import type {
  ApproveStatementExceptionRequest,
  CloseBankStatementSessionRequest,
  CreateBankStatementSessionRequest,
  RejectStatementExceptionRequest,
  ResolveStatementExceptionRequest,
} from "@naai-erp/contracts";
