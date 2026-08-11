import type { RecordFreelancePayablePaymentRequest } from "@naai-erp/contracts";
import type { JournalActorContext } from "../journals/journal.types.js";
export type ProjectFreelancePayableContext = JournalActorContext;
export type ProjectFreelancePayableStore = Readonly<{
  list(
    org: string,
    filters: { projectId?: string; freelancerPartyId?: string; state?: string },
  ): Promise<unknown>;
  get(org: string, id: string): Promise<unknown | undefined>;
  pay(
    context: ProjectFreelancePayableContext,
    id: string,
    input: RecordFreelancePayablePaymentRequest,
    key: string,
  ): Promise<unknown>;
}>;
export const PROJECT_FREELANCE_PAYABLE_STORE = Symbol("PROJECT_FREELANCE_PAYABLE_STORE");
