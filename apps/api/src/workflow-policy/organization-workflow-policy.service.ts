import { Injectable, type OnApplicationBootstrap } from "@nestjs/common";
import pg, { type PoolClient } from "pg";
import type {
  OrganizationOperatingMode,
  OrganizationWorkflowCapabilities,
  OrganizationWorkflowPolicy,
  SelfApprovalDecisionInput,
} from "./organization-workflow-policy.types.js";

type WorkflowPolicyEnvironment = Readonly<{
  NAAI_ERP_SOLOPRENEUR?: string;
  NAAI_ERP_LOGIN_ORGANIZATION?: string;
}>;

type Queryable = Pick<PoolClient, "query">;

const CONTROLLED_POLICY: OrganizationWorkflowPolicy = Object.freeze({
  operatingMode: "controlled",
  allowSelfApproval: false,
  selfApprovalMaxMinor: null,
});

export function environmentSolopreneurEnabled(
  environment: WorkflowPolicyEnvironment = process.env,
): boolean {
  const raw = environment.NAAI_ERP_SOLOPRENEUR?.trim().toLowerCase();
  if (!raw) return false;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new Error("NAAI_ERP_SOLOPRENEUR must be true or false");
}

export function workflowCapabilities(
  policy: OrganizationWorkflowPolicy,
): OrganizationWorkflowCapabilities {
  const solopreneur = policy.operatingMode === "solopreneur";
  return Object.freeze({
    operatingMode: policy.operatingMode,
    ownerCanSelfApprove: solopreneur,
    requiresDistinctApprover: !solopreneur,
    allowsBoundedSelfApproval: !solopreneur && policy.allowSelfApproval,
    documentedTaxDefaultsFinal: solopreneur,
  });
}

export function canSelfApprove(input: SelfApprovalDecisionInput): boolean {
  if (input.policy.operatingMode === "solopreneur") return input.roles.includes("owner");
  if (!input.policy.allowSelfApproval || input.policy.selfApprovalMaxMinor === null) return false;
  if (input.amountMinor === undefined || input.amountMinor < 0n) return false;
  return input.amountMinor <= input.policy.selfApprovalMaxMinor;
}

export async function bootstrapSolopreneurPolicy(
  database: Queryable,
  environment: WorkflowPolicyEnvironment = process.env,
): Promise<boolean> {
  if (!environmentSolopreneurEnabled(environment)) return false;
  const organizationId = environment.NAAI_ERP_LOGIN_ORGANIZATION?.trim();
  if (!organizationId)
    throw new Error("NAAI_ERP_LOGIN_ORGANIZATION is required when NAAI_ERP_SOLOPRENEUR=true");
  const organization = await database.query("select 1 from organizations where id=$1", [
    organizationId,
  ]);
  if (!organization.rows[0])
    throw new Error(`Solopreneur bootstrap organization does not exist: ${organizationId}`);
  const result = await database.query(
    `insert into accounting_workflow_policies
     (organization_id,operating_mode,allow_self_approval,self_approval_max_minor,updated_by)
     values($1,'solopreneur',false,null,'environment-bootstrap')
     on conflict(organization_id) do nothing
     returning organization_id`,
    [organizationId],
  );
  return result.rowCount === 1;
}

export async function resolveOrganizationWorkflowPolicy(
  organizationId: string,
  client: Queryable,
): Promise<OrganizationWorkflowPolicy> {
  const result = await client.query<{
    operating_mode: OrganizationOperatingMode;
    allow_self_approval: boolean;
    self_approval_max_minor: string | null;
  }>(
    `select operating_mode,allow_self_approval,self_approval_max_minor::text
     from accounting_workflow_policies where organization_id=$1`,
    [organizationId],
  );
  const row = result.rows[0];
  if (!row) return CONTROLLED_POLICY;
  return Object.freeze({
    operatingMode: row.operating_mode,
    allowSelfApproval: row.allow_self_approval,
    selfApprovalMaxMinor:
      row.self_approval_max_minor === null ? null : BigInt(row.self_approval_max_minor),
  });
}

@Injectable()
export class OrganizationWorkflowPolicyService implements OnApplicationBootstrap {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  async onApplicationBootstrap(): Promise<void> {
    await bootstrapSolopreneurPolicy(this.pool);
  }

  async resolve(
    organizationId: string,
    client: Queryable = this.pool,
  ): Promise<OrganizationWorkflowPolicy> {
    return resolveOrganizationWorkflowPolicy(organizationId, client);
  }

  async capabilities(
    organizationId: string,
    client?: Queryable,
  ): Promise<OrganizationWorkflowCapabilities> {
    return workflowCapabilities(await this.resolve(organizationId, client));
  }
}
