import type { JournalActorContext } from "../journals/journal.types.js";

export type OperatingDashboardQuery = Readonly<{
  asOf: string;
  startsOn: string;
  endsOn: string;
  limit: number;
}>;

export type OperatingDashboardContext = JournalActorContext;

export type OperatingDashboardReadModel = Readonly<{
  schemaVersion: 1;
  asOf: string;
  currency: string;
  backlog: Readonly<{
    projectCount: number;
    contractedMinor: string;
    invoicedMinor: string;
    remainingMinor: string;
    projects: readonly Record<string, unknown>[];
  }>;
  collections: Readonly<{
    receivablesMinor: string;
    creditSalesMinor: string;
    dsoDays: number | null;
    overdueMinor: string;
    dueWithin7DaysMinor: string;
    dueWithin30DaysMinor: string;
    laterMinor: string;
  }>;
  projectBurn: readonly Record<string, unknown>[];
  clientConcentration: Readonly<{
    totalRevenueMinor: string;
    topClientShareBps: number | null;
    topThreeShareBps: number | null;
    clients: readonly Record<string, unknown>[];
  }>;
  dataQuality: Readonly<{
    pendingCount: number;
    byFlag: readonly Readonly<{ flag: string; count: number }>[];
    rows: readonly Record<string, unknown>[];
  }>;
}>;

export type OperatingDashboardStore = Readonly<{
  read(
    organizationId: string,
    query: OperatingDashboardQuery,
  ): Promise<OperatingDashboardReadModel>;
}>;

export const OPERATING_DASHBOARD_STORE = Symbol("OPERATING_DASHBOARD_STORE");
