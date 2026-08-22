import type { JournalActorContext } from "../journals/journal.types.js";
export type OperationalLogContext = JournalActorContext;
export type OperationalLogFilters = Readonly<{
  status?: string;
  service?: string;
  severity?: string;
  cursor?: string;
  limit?: number;
}>;
export type OperationalLogStore = Readonly<{
  list(organizationId: string, filters: OperationalLogFilters): Promise<unknown>;
  purgeExpired(now: Date, limit?: number): Promise<number>;
}>;
export const OPERATIONAL_LOG_STORE = Symbol("OPERATIONAL_LOG_STORE");
