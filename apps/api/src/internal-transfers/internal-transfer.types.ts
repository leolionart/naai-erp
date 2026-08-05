import type {
  CreateInternalTransferRequest,
  MatchInternalTransferRequest,
  UnmatchInternalTransferRequest,
} from "@naai-erp/contracts";
import type { JournalActorContext } from "../journals/journal.types.js";
export type InternalTransferContext = JournalActorContext;
export type CreateInternalTransferInput = CreateInternalTransferRequest;
export type MatchInternalTransferInput = MatchInternalTransferRequest;
export type UnmatchInternalTransferInput = UnmatchInternalTransferRequest;
export type InternalTransferStore = Readonly<{
  list(org: string, filters: { state?: string; financialAccountId?: string }): Promise<unknown>;
  get(org: string, id: string): Promise<unknown | undefined>;
  transactionCandidates(org: string, transactionId: string): Promise<unknown>;
  create(
    context: InternalTransferContext,
    input: CreateInternalTransferInput,
    key: string,
  ): Promise<unknown>;
  match(
    context: InternalTransferContext,
    id: string,
    input: MatchInternalTransferInput,
    key: string,
  ): Promise<unknown>;
  unmatch(
    context: InternalTransferContext,
    id: string,
    input: UnmatchInternalTransferInput,
    key: string,
  ): Promise<unknown>;
}>;
export const INTERNAL_TRANSFER_STORE = Symbol("INTERNAL_TRANSFER_STORE");
