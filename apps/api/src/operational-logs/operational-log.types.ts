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
  start?(input: {
    organizationId: string;
    id: string;
    service: string;
    operation: string;
    correlationId?: string | null;
    summary: string;
    details?: unknown;
  }): Promise<void>;
  finish?(
    organizationId: string,
    id: string,
    result: {
      status: "succeeded" | "failed";
      severity?: "info" | "warning" | "error";
      summary?: string;
      details?: unknown;
    },
  ): Promise<void>;
}>;
export const OPERATIONAL_LOG_STORE = Symbol("OPERATIONAL_LOG_STORE");
