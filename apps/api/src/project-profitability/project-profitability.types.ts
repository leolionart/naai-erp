import type { ProjectProfitabilityInput } from "@naai-erp/domain";
import type { JournalActorContext } from "../journals/journal.types.js";

export type ProjectProfitabilityContext = JournalActorContext;

export type ProjectProfitabilityQuery = Readonly<{
  asOf: string;
  periodStart: string;
  periodEnd: string;
  clientId?: string;
  serviceLineId?: string;
  accountOwnerId?: string;
  projectId?: string;
  groupBy?: "project" | "client" | "service_line" | "account_owner";
  confidenceFlag?: "unbilled_work" | "overdue_ar" | "budget_overrun" | "missing_dimensions";
}>;

export type ProfitabilityBreakdown = Readonly<{
  revenueBreakdown: readonly Record<string, unknown>[];
  directCostBreakdown: readonly Record<string, unknown>[];
  overheadBreakdown: readonly Record<string, unknown>[];
  glTie: Record<string, unknown>;
}>;

export type ProjectProfitabilitySource = ProjectProfitabilityInput &
  Readonly<{
    projectCode: string;
    projectName: string;
    clientName: string;
    serviceLineName?: string;
    accountOwnerName: string;
    budgetRevenueMinor: bigint;
    breakdown: ProfitabilityBreakdown;
  }>;

export type ProjectProfitabilityStore = Readonly<{
  list(
    organizationId: string,
    query: ProjectProfitabilityQuery,
  ): Promise<readonly ProjectProfitabilitySource[]>;
  get(
    organizationId: string,
    projectId: string,
    query: ProjectProfitabilityQuery,
  ): Promise<ProjectProfitabilitySource | undefined>;
}>;

export const PROJECT_PROFITABILITY_STORE = Symbol("PROJECT_PROFITABILITY_STORE");
