import { createHash, randomUUID } from "node:crypto";
import { Injectable, type OnApplicationBootstrap } from "@nestjs/common";
import { DEFAULT_NON_CASH_THRESHOLD_MINOR } from "@naai-erp/domain";
import pg, { type PoolClient } from "pg";
import type { JournalActorContext } from "../journals/journal.types.js";
import type {
  OrganizationOperatingMode,
  OrganizationWorkflowCapabilities,
  OrganizationWorkflowPolicy,
  SelfApprovalDecisionInput,
  UpdateOrganizationWorkflowPolicyInput,
} from "./organization-workflow-policy.types.js";

type WorkflowPolicyEnvironment = Readonly<{
  NAAI_ERP_SOLOPRENEUR?: string;
  NAAI_ERP_LOGIN_ORGANIZATION?: string;
}>;

type Queryable = Pick<PoolClient, "query">;

const POLICY_WRITE_ROLES = new Set(["owner", "finance_admin"]);

const CONTROLLED_POLICY: OrganizationWorkflowPolicy = Object.freeze({
  operatingMode: "controlled",
  allowSelfApproval: false,
  selfApprovalMaxMinor: null,
  nonCashThresholdMinor: DEFAULT_NON_CASH_THRESHOLD_MINOR,
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
    nonCashThresholdMinor: (
      policy.nonCashThresholdMinor ?? DEFAULT_NON_CASH_THRESHOLD_MINOR
    ).toString(),
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
    non_cash_threshold_minor?: string | null;
  }>(
    `select operating_mode,allow_self_approval,self_approval_max_minor::text,non_cash_threshold_minor::text
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
    nonCashThresholdMinor:
      row.non_cash_threshold_minor === null || row.non_cash_threshold_minor === undefined
        ? DEFAULT_NON_CASH_THRESHOLD_MINOR
        : BigInt(row.non_cash_threshold_minor),
  });
}

function parseNonNegativeMinor(value: string | number): bigint {
  const raw = String(value).trim();
  if (!/^\d+$/.test(raw)) throw new Error("VALIDATION_FAILED");
  return BigInt(raw);
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

  async update(
    context: JournalActorContext,
    input: UpdateOrganizationWorkflowPolicyInput,
    idempotencyKey?: string,
  ): Promise<OrganizationWorkflowCapabilities & { idempotencyReplayed: boolean }> {
    if (!context.roles.some((role) => POLICY_WRITE_ROLES.has(role))) throw new Error("FORBIDDEN");
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    const requestHash = createHash("sha256")
      .update(JSON.stringify(input ?? {}))
      .digest("hex");

    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `${context.organizationId}:${idempotencyKey}`,
      ]);
      const replay = await client.query<{
        request_hash: string;
        response_body: OrganizationWorkflowCapabilities;
      }>(
        `select request_hash, response_body from api_idempotency_records
          where organization_id = $1 and idempotency_key = $2 for update`,
        [context.organizationId, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_hash !== requestHash) throw new Error("IDEMPOTENCY_CONFLICT");
        await client.query("rollback");
        return { ...replay.rows[0].response_body, idempotencyReplayed: true };
      }

      const current = await resolveOrganizationWorkflowPolicy(context.organizationId, client);
      const rawMode = input?.operatingMode ?? input?.operating_mode;
      if (rawMode !== undefined && rawMode !== "controlled" && rawMode !== "solopreneur") {
        throw new Error("VALIDATION_FAILED");
      }
      const nextMode = rawMode ?? current.operatingMode;
      const rawSelf = input?.allowSelfApproval ?? input?.allow_self_approval;
      if (rawSelf !== undefined && typeof rawSelf !== "boolean") {
        throw new Error("VALIDATION_FAILED");
      }
      const nextAllowSelf = rawSelf ?? current.allowSelfApproval;

      const hasMax =
        input?.selfApprovalMaxMinor !== undefined || input?.self_approval_max_minor !== undefined;
      const rawMax =
        input?.selfApprovalMaxMinor !== undefined
          ? input.selfApprovalMaxMinor
          : input?.self_approval_max_minor;
      const nextMax = hasMax
        ? rawMax === null
          ? null
          : parseNonNegativeMinor(rawMax!)
        : current.selfApprovalMaxMinor;
      if ((nextAllowSelf && nextMax === null) || (!nextAllowSelf && nextMax !== null)) {
        throw new Error("VALIDATION_FAILED");
      }

      const rawThreshold = input?.nonCashThresholdMinor ?? input?.non_cash_threshold_minor;
      const nextThreshold =
        rawThreshold !== undefined
          ? parseNonNegativeMinor(rawThreshold)
          : (current.nonCashThresholdMinor ?? DEFAULT_NON_CASH_THRESHOLD_MINOR);

      await client.query(
        `insert into accounting_workflow_policies
           (organization_id, operating_mode, allow_self_approval, self_approval_max_minor, non_cash_threshold_minor, updated_by, updated_at)
         values ($1, $2, $3, $4::bigint, $5::bigint, $6, now())
         on conflict (organization_id) do update set
           operating_mode = excluded.operating_mode,
           allow_self_approval = excluded.allow_self_approval,
           self_approval_max_minor = excluded.self_approval_max_minor,
           non_cash_threshold_minor = excluded.non_cash_threshold_minor,
           updated_by = excluded.updated_by,
           updated_at = now()`,
        [
          context.organizationId,
          nextMode,
          nextAllowSelf,
          nextMax === null ? null : nextMax.toString(),
          nextThreshold.toString(),
          context.actorId,
        ],
      );

      const updated = workflowCapabilities({
        operatingMode: nextMode,
        allowSelfApproval: nextAllowSelf,
        selfApprovalMaxMinor: nextMax,
        nonCashThresholdMinor: nextThreshold,
      });
      await client.query(
        `insert into resource_audit_events
           (organization_id, id, resource_type, resource_key, resource_version, action, actor_id, correlation_id, before_state, after_state)
         values ($1, $2, 'accounting_workflow_policy', $1, '1', 'update', $3, $4, $5, $6)`,
        [
          context.organizationId,
          randomUUID(),
          context.actorId,
          context.correlationId,
          workflowCapabilities(current),
          updated,
        ],
      );
      await client.query(
        `insert into api_idempotency_records
           (organization_id, idempotency_key, operation, request_hash, response_body)
         values ($1, $2, 'workflow-policy:update', $3, $4)`,
        [context.organizationId, idempotencyKey, requestHash, updated],
      );
      await client.query("commit");
      return { ...updated, idempotencyReplayed: false };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}
