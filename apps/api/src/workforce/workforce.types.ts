import type { JournalActorContext } from "../journals/journal.types.js";

export type WorkforceContext = JournalActorContext;
export type MutationInput = {
  schemaVersion: 1;
  expectedResourceVersion: string;
  reason: string;
  billingReference?: string;
  employmentKind?: "employee" | "freelancer" | "contractor";
  endsOn?: string | null;
};
export type WorkforceStore = Readonly<{
  listWorkers(org: string): Promise<unknown>;
  createWorker(c: WorkforceContext, input: Record<string, unknown>, key: string): Promise<unknown>;
  updateWorker(
    c: WorkforceContext,
    id: string,
    input: Record<string, unknown>,
    key: string,
    deactivate?: boolean,
  ): Promise<unknown>;
  listTimesheets(org: string, query: Record<string, string | undefined>): Promise<unknown>;
  getTimesheet(org: string, id: string): Promise<unknown | undefined>;
  createTimesheet(
    c: WorkforceContext,
    input: Record<string, unknown>,
    key: string,
  ): Promise<unknown>;
  transitionTimesheet(
    c: WorkforceContext,
    id: string,
    action: string,
    input: MutationInput,
    key: string,
  ): Promise<unknown>;
  createAdjustment(
    c: WorkforceContext,
    id: string,
    input: Record<string, unknown>,
    key: string,
  ): Promise<unknown>;
  reviewAdjustment(
    c: WorkforceContext,
    id: string,
    adjustmentId: string,
    action: string,
    input: MutationInput,
    key: string,
  ): Promise<unknown>;
  listRates(org: string, workerId?: string): Promise<unknown>;
  createRate(c: WorkforceContext, input: Record<string, unknown>, key: string): Promise<unknown>;
  reviewRate(
    c: WorkforceContext,
    id: string,
    action: string,
    input: MutationInput,
    key: string,
  ): Promise<unknown>;
  listCapacity(org: string, workerId?: string): Promise<unknown>;
  createCapacity(
    c: WorkforceContext,
    input: Record<string, unknown>,
    key: string,
  ): Promise<unknown>;
  capacitySummary(org: string, query: Record<string, string | undefined>): Promise<unknown>;
}>;
export const WORKFORCE_STORE = Symbol("WORKFORCE_STORE");
