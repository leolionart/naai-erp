import type {
  EstimatedCitReportContract,
  OrganizationCitPolicyContract,
  UpdateOrganizationCitPolicyRequest,
  UpsertOrganizationCitRateTiersRequest,
} from "@naai-erp/contracts";
import type { JournalActorContext } from "../journals/journal.types.js";

export type CitPolicyContext = JournalActorContext;

export type CitEstimateQuery = Readonly<{
  startsOn: string;
  endsOn: string;
  asOf?: string;
}>;

export type UpsertCitPolicyResult = Readonly<{
  policy: OrganizationCitPolicyContract;
  idempotencyReplayed: boolean;
}>;

export type CitPolicyStore = Readonly<{
  getPolicy(organizationId: string, taxYear?: number): Promise<OrganizationCitPolicyContract>;
  upsertPolicy(
    context: CitPolicyContext,
    input: UpdateOrganizationCitPolicyRequest,
    idempotencyKey: string,
    expectedVersion?: string,
  ): Promise<UpsertCitPolicyResult>;
  upsertRateTiers(
    context: CitPolicyContext,
    effectiveFromYear: number,
    input: UpsertOrganizationCitRateTiersRequest,
    idempotencyKey: string,
  ): Promise<UpsertCitPolicyResult>;
  estimateReport(
    organizationId: string,
    query: CitEstimateQuery,
  ): Promise<EstimatedCitReportContract>;
}>;

export const CIT_POLICY_STORE = Symbol("CIT_POLICY_STORE");
