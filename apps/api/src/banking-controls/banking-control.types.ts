import type {
  ApproveStatementExceptionRequest,
  BankStatementSessionDetailContract,
  CloseBankStatementSessionRequest,
  CreateBankStatementSessionRequest,
  CreateStatementExceptionRequest,
  RejectStatementExceptionRequest,
  ResolveStatementExceptionRequest,
  ReviewBankStatementSessionRequest,
} from "@naai-erp/contracts";
import type { JournalActorContext } from "../journals/journal.types.js";
export type BankingControlContext = JournalActorContext;
export type CreateStatementSessionInput = CreateBankStatementSessionRequest;
export type ReviewStatementSessionInput = ReviewBankStatementSessionRequest;
export type CloseStatementSessionInput = CloseBankStatementSessionRequest;
export type CreateControlExceptionInput = CreateStatementExceptionRequest;
export type ReviewControlExceptionInput =
  | ApproveStatementExceptionRequest
  | ResolveStatementExceptionRequest
  | RejectStatementExceptionRequest;
export type BankingControlStore = Readonly<{
  list(org: string): Promise<{ items: readonly BankStatementSessionDetailContract["session"][] }>;
  get(org: string, id: string): Promise<BankStatementSessionDetailContract | undefined>;
  create(
    c: BankingControlContext,
    input: CreateStatementSessionInput,
    key: string,
  ): Promise<unknown>;
  review(
    c: BankingControlContext,
    id: string,
    input: ReviewStatementSessionInput,
    key: string,
  ): Promise<unknown>;
  close(
    c: BankingControlContext,
    id: string,
    input: CloseStatementSessionInput,
    key: string,
  ): Promise<unknown>;
  createException(
    c: BankingControlContext,
    sessionId: string,
    input: CreateControlExceptionInput,
    key: string,
  ): Promise<unknown>;
  reviewException(
    c: BankingControlContext,
    sessionId: string,
    id: string,
    action: "approve" | "resolve" | "reject",
    input: ReviewControlExceptionInput,
    key: string,
  ): Promise<unknown>;
}>;
export const BANKING_CONTROL_STORE = Symbol("BANKING_CONTROL_STORE");
