import type { JournalActorContext } from "../journals/journal.types.js";
export type OperationalLogContext = JournalActorContext;
export type OperationalLogFilters = Readonly<{
  status?: string;
  service?: string;
  severity?: string;
  cursor?: string;
  limit?: number;
}>;
export type UnifiedActivityFilters = Readonly<{
  source?: "operational" | "resource_audit" | "planning_audit";
  eventType?: string;
  actorId?: string;
  severity?: string;
  status?: string;
  cursor?: string;
  limit?: number;
}>;
export type OperationalLogStore = Readonly<{
  list(organizationId: string, filters: OperationalLogFilters): Promise<unknown>;
  listAll?(organizationId: string, filters: UnifiedActivityFilters): Promise<unknown>;
  purgeExpired(now: Date, limit?: number): Promise<number>;
  listEvents?(organizationId: string, activityId: string): Promise<unknown>;
}>;
export const OPERATIONAL_LOG_STORE = Symbol("OPERATIONAL_LOG_STORE");
