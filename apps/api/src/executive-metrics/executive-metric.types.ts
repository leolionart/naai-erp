import type { JournalActorContext } from "../journals/journal.types.js";

export type ExecutiveMetricContext = JournalActorContext;
export type ExecutiveMetricQuery = Readonly<{
  startsOn: string;
  endsOn: string;
  asOfInstant: string;
  framework: "TT133" | "TT200";
  dimensions: Record<string, string>;
}>;
export type PolicyInput = Readonly<{
  id?: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  formulaVersion: string;
  formulaPolicy: Readonly<{
    averageBurnMonths: number;
    equityConsumedDenominator: "contributed_capital";
    runwayCashSemantic: "unrestricted_cash";
    runwayFlowClass: "operating";
    signedRevenueDenominator: boolean;
  }>;
  changeReason: string;
  mappings: readonly Readonly<{
    semantic:
      | "contributed_capital"
      | "retained_earnings"
      | "unrestricted_cash"
      | "restricted_cash"
      | "reviewed_equity_adjustment"
      | "other_equity"
      | "owner_withdrawal"
      | "owner_loan";
    accountCode: string;
    sign?: -1 | 1;
    notes?: string;
  }>[];
}>;
export type RoiDefinitionInput = Readonly<{
  id?: string;
  purpose: "project" | "marketing" | "custom";
  name: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  formulaVersion: string;
  includedCostPolicy: { includedKinds: readonly string[]; excludedKinds: readonly string[] };
  changeReason: string;
}>;
export type RoiFactInput = Readonly<{
  id?: string;
  definitionId: string;
  definitionVersion: number;
  kind: "benefit" | "included_cost";
  periodStartsOn: string;
  periodEndsOn: string;
  dimensions?: Record<string, string>;
  amountMinor: string;
  currency: string;
  sourceType: string;
  sourceId: string;
}>;
export type ExecutiveMetricStore = Readonly<{
  listPolicies(c: ExecutiveMetricContext): Promise<unknown>;
  getPolicy(c: ExecutiveMetricContext, id: string, version?: number): Promise<unknown>;
  createPolicy(c: ExecutiveMetricContext, input: PolicyInput, key: string): Promise<unknown>;
  approvePolicy(
    c: ExecutiveMetricContext,
    id: string,
    version: number,
    reason: string,
    key: string,
  ): Promise<unknown>;
  listDefinitions(c: ExecutiveMetricContext): Promise<unknown>;
  getDefinition(c: ExecutiveMetricContext, id: string, version?: number): Promise<unknown>;
  createDefinition(
    c: ExecutiveMetricContext,
    input: RoiDefinitionInput,
    key: string,
  ): Promise<unknown>;
  approveDefinition(
    c: ExecutiveMetricContext,
    id: string,
    version: number,
    reason: string,
    key: string,
  ): Promise<unknown>;
  listFacts(
    c: ExecutiveMetricContext,
    definitionId?: string,
    reviewState?: string,
  ): Promise<unknown>;
  createFact(c: ExecutiveMetricContext, input: RoiFactInput, key: string): Promise<unknown>;
  reviewFact(
    c: ExecutiveMetricContext,
    id: string,
    state: "reviewed" | "rejected",
    reason: string,
    key: string,
  ): Promise<unknown>;
  report(c: ExecutiveMetricContext, q: ExecutiveMetricQuery): Promise<unknown>;
}>;
export const EXECUTIVE_METRIC_STORE = Symbol("EXECUTIVE_METRIC_STORE");
