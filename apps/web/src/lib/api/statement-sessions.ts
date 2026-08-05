import type {
  ApproveStatementExceptionRequest,
  BankStatementImportLinkContract,
  BankStatementSessionDetailContract,
  BankStatementSessionSummaryContract,
  CloseBankStatementSessionRequest,
  CreateBankStatementSessionRequest,
  RejectStatementExceptionRequest,
  ResolveStatementExceptionRequest,
  ReviewBankStatementSessionRequest,
  StatementSuspenseExceptionContract,
  StatementTransactionControlContract,
} from "@naai-erp/contracts";

export type StatementSessionContract = BankStatementSessionSummaryContract;
export type StatementSessionDetailContract = BankStatementSessionDetailContract;
export type StatementImportDisposition = BankStatementImportLinkContract;
export type StatementExceptionContract = StatementSuspenseExceptionContract;
export type StatementTransactionContract = StatementTransactionControlContract;
export type CreateStatementSessionRequest = CreateBankStatementSessionRequest;
export type CloseStatementSessionRequest = CloseBankStatementSessionRequest;
export type ReviewStatementSessionRequest = ReviewBankStatementSessionRequest;
export type ReviewStatementExceptionRequest =
  | ApproveStatementExceptionRequest
  | ResolveStatementExceptionRequest
  | RejectStatementExceptionRequest;

const detailPath = (sessionId: string) =>
  `banking/statement-sessions/${encodeURIComponent(sessionId)}`;

export const statementSessionApi = Object.freeze({
  list: "banking/statement-sessions",
  detail: detailPath,
  review(sessionId: string) {
    return `${detailPath(sessionId)}/review`;
  },
  close(sessionId: string) {
    return `${detailPath(sessionId)}/close`;
  },
  exceptions(sessionId: string) {
    return `${detailPath(sessionId)}/exceptions`;
  },
  reviewException(
    sessionId: string,
    exceptionId: string,
    action: "approve" | "resolve" | "reject",
  ) {
    return `${detailPath(sessionId)}/exceptions/${encodeURIComponent(exceptionId)}/${action}`;
  },
});
