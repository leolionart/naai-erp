import type { JournalActorContext } from "../journals/journal.types.js";

export type PerformanceContext = JournalActorContext;
export type PerformanceQuery = Readonly<{
  periodId: string;
  periodBasis: "calendar" | "fiscal";
  actualBasis: "recognized" | "invoiced" | "collected";
  asOfInstant: string;
  forecastVersionId?: string;
  dimensions: Record<string, string>;
}>;
export type ActualFactQuery = Readonly<{
  actualBasis?: "recognized" | "invoiced" | "collected";
  from?: string;
  to?: string;
  cursor?: string;
  limit: number;
}>;
export type ActualFactSummaryQuery = Readonly<{
  actualBasis: "recognized" | "invoiced" | "collected";
  from: string;
  to: string;
  dimensions: Record<string, string>;
}>;
export type PerformanceStore = Readonly<{
  report(c: PerformanceContext, query: PerformanceQuery): Promise<unknown>;
  listFacts(c: PerformanceContext, query: ActualFactQuery): Promise<unknown>;
  summarizeFacts(c: PerformanceContext, query: ActualFactSummaryQuery): Promise<unknown>;
  backfill(c: PerformanceContext, input: Record<string, unknown>, key: string): Promise<unknown>;
}>;
export const PERFORMANCE_STORE = Symbol("PERFORMANCE_STORE");
