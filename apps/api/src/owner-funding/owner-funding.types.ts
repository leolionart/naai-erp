import type { JournalActorContext } from "../journals/journal.types.js";
import type {
  OwnerFundingListContract,
  OwnerFundingMovementContract,
  OwnerFundingMovementTypeContract,
  RecordOwnerFundingRequest,
  RecordOwnerFundingResponseContract,
} from "@naai-erp/contracts";

export type OwnerFundingContext = JournalActorContext;

export type OwnerFundingListFilters = Readonly<{
  movementType?: OwnerFundingMovementTypeContract;
  financialAccountId?: string;
  from?: string;
  to?: string;
}>;

export type RecordOwnerFundingInput = RecordOwnerFundingRequest;

export type OwnerFundingStore = Readonly<{
  list(organizationId: string, filters: OwnerFundingListFilters): Promise<OwnerFundingListContract>;
  get(organizationId: string, id: string): Promise<OwnerFundingMovementContract | undefined>;
  record(
    context: OwnerFundingContext,
    input: RecordOwnerFundingInput & { movementType: OwnerFundingMovementTypeContract },
    idempotencyKey: string,
  ): Promise<RecordOwnerFundingResponseContract>;
}>;

export const OWNER_FUNDING_STORE = Symbol("OWNER_FUNDING_STORE");
