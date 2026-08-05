import type { MutationMetadata } from "./index.js";

export const PLANNING_CONTRACT_VERSION = 1 as const;
export type ActualBasisContract = "recognized" | "invoiced" | "collected";
export type PlanningDimensionsContract = Readonly<{
  teamId?: string;
  serviceLineCode?: string;
  ownerId?: string;
}>;
export type PlanningTransitionRequest = Readonly<{
  schemaVersion: typeof PLANNING_CONTRACT_VERSION;
  expectedResourceVersion: string;
  reason: string;
}>;

export type RevenueTargetVersionContract = Readonly<{
  schemaVersion: typeof PLANNING_CONTRACT_VERSION;
  id: string;
  versionNumber: number;
  previousVersionId?: string;
  periodKind: "month" | "quarter" | "year";
  startsOn: string;
  endsOn: string;
  actualBasis: ActualBasisContract;
  currency: string;
  amountMinor: string;
  dimensions: PlanningDimensionsContract;
  state: "draft" | "published" | "superseded";
  publishedAt?: string;
  publishedBy?: string;
  resourceVersion: string;
  nextActions: readonly string[];
}>;
export type CreateRevenueTargetVersionRequest = Readonly<{
  schemaVersion: typeof PLANNING_CONTRACT_VERSION;
  id?: string;
  versionNumber: number;
  previousVersionId?: string;
  periodKind: RevenueTargetVersionContract["periodKind"];
  startsOn: string;
  endsOn: string;
  actualBasis: ActualBasisContract;
  currency: string;
  amountMinor: string;
  dimensions?: PlanningDimensionsContract;
  reason: string;
}>;

export type ForecastVersionContract = Readonly<{
  schemaVersion: typeof PLANNING_CONTRACT_VERSION;
  id: string;
  versionNumber: number;
  previousVersionId?: string;
  scenario: "base" | "best" | "worst" | "custom";
  customScenarioName?: string;
  snapshotKind: "working" | "month_end";
  asOfDate: string;
  startsOn: string;
  endsOn: string;
  actualBasis: ActualBasisContract;
  currency: string;
  dimensions: PlanningDimensionsContract;
  state: "draft" | "published" | "superseded";
  publishedAt?: string;
  publishedBy?: string;
  resourceVersion: string;
  nextActions: readonly string[];
}>;
export type CreateForecastVersionRequest = Readonly<{
  schemaVersion: typeof PLANNING_CONTRACT_VERSION;
  id?: string;
  versionNumber: number;
  previousVersionId?: string;
  scenario: ForecastVersionContract["scenario"];
  customScenarioName?: string;
  snapshotKind: ForecastVersionContract["snapshotKind"];
  asOfDate: string;
  startsOn: string;
  endsOn: string;
  actualBasis: ActualBasisContract;
  currency: string;
  dimensions?: PlanningDimensionsContract;
  reason: string;
}>;

export type PlanningMutationResult<T> = Readonly<{
  resource: T;
  mutation: MutationMetadata;
}>;
