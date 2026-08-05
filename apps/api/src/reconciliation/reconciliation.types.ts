import type {
  MatchReconciliationRequest,
  ReconcilePaymentRequest,
  SuggestReconciliationRequest,
  UnreconcilePaymentRequest,
} from "@naai-erp/contracts";
import type { JournalActorContext } from "../journals/journal.types.js";

export type ReconciliationContext = JournalActorContext;
export type SuggestInput = SuggestReconciliationRequest;
export type MatchInput = MatchReconciliationRequest;
export type ReconcileInput = ReconcilePaymentRequest;
export type UnreconcileInput = UnreconcilePaymentRequest;

export type ReconciliationStore = Readonly<{
  getCandidates(organizationId: string, transactionId: string): Promise<unknown>;
  suggest(
    context: ReconciliationContext,
    transactionId: string,
    input: SuggestInput,
    key: string,
  ): Promise<unknown>;
  match(
    context: ReconciliationContext,
    transactionId: string,
    input: MatchInput,
    key: string,
  ): Promise<unknown>;
  reconcile(
    context: ReconciliationContext,
    transactionId: string,
    input: ReconcileInput,
    key: string,
  ): Promise<unknown>;
  unreconcile(
    context: ReconciliationContext,
    transactionId: string,
    input: UnreconcileInput,
    key: string,
  ): Promise<unknown>;
  list(
    organizationId: string,
    filters: { state?: string; financialAccountId?: string },
  ): Promise<unknown>;
  get(organizationId: string, id: string): Promise<unknown | undefined>;
}>;

export const RECONCILIATION_STORE = Symbol("RECONCILIATION_STORE");
