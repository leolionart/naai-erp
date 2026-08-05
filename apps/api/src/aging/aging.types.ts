import type {
  AgingItemDetailContract,
  AgingListQueryContract,
  AgingReportContract,
  AgingSideContract,
} from "@naai-erp/contracts";
import type { JournalActorContext } from "../journals/journal.types.js";

export type AgingSide = AgingSideContract;
export type AgingQuery = AgingListQueryContract &
  Readonly<{ limit: number; includeSettled: boolean }>;
export type AgingContext = JournalActorContext;
export type AgingStore = Readonly<{
  report(organizationId: string, side: AgingSide, query: AgingQuery): Promise<AgingReportContract>;
  item(
    organizationId: string,
    side: AgingSide,
    itemId: string,
    query: AgingQuery,
  ): Promise<AgingItemDetailContract | undefined>;
}>;
export const AGING_STORE = Symbol("AGING_STORE");
