import { createHash, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type {
  EstimatedCitReportContract,
  OrganizationCitPolicyContract,
  UpdateOrganizationCitPolicyRequest,
  UpsertOrganizationCitRateTiersRequest,
} from "@naai-erp/contracts";
import {
  selectCitRateSchedule,
  validateCitRateSchedule,
  type CitRateSchedule,
} from "@naai-erp/domain";
import pg, { type PoolClient } from "pg";
import type {
  CitEstimateQuery,
  CitPolicyContext,
  CitPolicyStore,
  UpsertCitPolicyResult,
} from "./cit-policy.types.js";
import {
  loadCitSchedulesAndPolicy,
  resolvePgCitEstimate,
  scheduleToContract,
  type PolicyRow,
} from "./pg-cit-estimate.js";

const toIso = (value: Date | string | null | undefined): string | null => {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
};

@Injectable()
export class PgCitPolicyStore implements CitPolicyStore {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  private async checkReplay<T>(
    client: PoolClient,
    organizationId: string,
    key: string,
    requestHash: string,
  ): Promise<T | undefined> {
    const existing = await client.query<{ request_hash: string; response_body: T }>(
      `select request_hash,response_body from api_idempotency_records
        where organization_id=$1 and idempotency_key=$2 for update`,
      [organizationId, key],
    );
    const row = existing.rows[0];
    if (!row) return undefined;
    if (row.request_hash !== requestHash) throw new Error("IDEMPOTENCY_CONFLICT");
    return row.response_body;
  }

  private async saveReplay(
    client: PoolClient,
    organizationId: string,
    key: string,
    operation: string,
    requestHash: string,
    payload: unknown,
  ) {
    await client.query(
      `insert into api_idempotency_records(organization_id,idempotency_key,operation,request_hash,response_body)
       values($1,$2,$3,$4,$5)
       on conflict(organization_id,idempotency_key) do nothing`,
      [organizationId, key, operation, requestHash, payload],
    );
  }

  private async buildPolicyContract(
    db: Pick<pg.Pool, "query">,
    organizationId: string,
    taxYear?: number,
  ): Promise<OrganizationCitPolicyContract> {
    const orgExists = await db.query(`select 1 from organizations where id=$1`, [organizationId]);
    if (!orgExists.rows[0]) throw new Error("RESOURCE_NOT_FOUND");

    const loaded = await loadCitSchedulesAndPolicy(db, organizationId);
    const row = loaded.policyRow;
    const effective =
      taxYear !== undefined
        ? selectCitRateSchedule(taxYear, loaded.orgSchedules, loaded.statutorySchedules)
        : null;

    return {
      organizationId,
      citSmallEnterpriseIneligible: row?.cit_small_enterprise_ineligible ?? false,
      ineligibilityReason: row?.ineligibility_reason ?? null,
      priorYearRevenueOverrideMinor: row?.prior_year_revenue_override_minor ?? null,
      version: row?.version ?? "0",
      updatedBy: row?.updated_by ?? null,
      updatedAt: toIso(row?.updated_at),
      organizationSchedules: loaded.orgSchedules.map((s) =>
        scheduleToContract(s, loaded.versionByYear.get(s.effectiveFromYear)),
      ),
      statutorySchedules: loaded.statutorySchedules.map((s) => scheduleToContract(s)),
      ...(taxYear !== undefined
        ? {
            effectiveSchedule: effective
              ? scheduleToContract(
                  effective,
                  effective.source === "organization"
                    ? loaded.versionByYear.get(effective.effectiveFromYear)
                    : undefined,
                )
              : null,
          }
        : {}),
    };
  }

  async getPolicy(
    organizationId: string,
    taxYear?: number,
  ): Promise<OrganizationCitPolicyContract> {
    return this.buildPolicyContract(this.pool, organizationId, taxYear);
  }

  async upsertPolicy(
    context: CitPolicyContext,
    input: UpdateOrganizationCitPolicyRequest,
    idempotencyKey: string,
    expectedVersion?: string,
  ): Promise<UpsertCitPolicyResult> {
    const operation = "cit-policy:upsert";
    const requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const replay = await this.checkReplay<{ policy: OrganizationCitPolicyContract }>(
        client,
        context.organizationId,
        idempotencyKey,
        requestHash,
      );
      if (replay) {
        await client.query("commit");
        return { ...replay, idempotencyReplayed: true };
      }

      const existing = await client.query<PolicyRow>(
        `select organization_id,cit_small_enterprise_ineligible,ineligibility_reason,
                prior_year_revenue_override_minor::text,updated_by,updated_at,version::text
           from organization_cit_policies
          where organization_id=$1 for update`,
        [context.organizationId],
      );
      const before = existing.rows[0] ?? null;
      if (expectedVersion !== undefined) {
        const currentVersion = before?.version ?? "0";
        if (currentVersion !== expectedVersion) throw new Error("VERSION_CONFLICT");
      }

      const ineligibilityReason = input.ineligibilityReason?.trim() || null;
      const overrideMinor =
        input.priorYearRevenueOverrideMinor == null ||
        input.priorYearRevenueOverrideMinor.trim() === ""
          ? null
          : BigInt(input.priorYearRevenueOverrideMinor.trim()).toString();

      const upserted = await client.query<{ version: string }>(
        `insert into organization_cit_policies
           (organization_id,cit_small_enterprise_ineligible,ineligibility_reason,prior_year_revenue_override_minor,updated_by,updated_at,version)
         values($1,$2,$3,$4::bigint,$5,now(),1)
         on conflict(organization_id) do update set
           cit_small_enterprise_ineligible=excluded.cit_small_enterprise_ineligible,
           ineligibility_reason=excluded.ineligibility_reason,
           prior_year_revenue_override_minor=excluded.prior_year_revenue_override_minor,
           updated_by=excluded.updated_by,
           updated_at=now(),
           version=organization_cit_policies.version+1
         returning version::text`,
        [
          context.organizationId,
          input.citSmallEnterpriseIneligible,
          ineligibilityReason,
          overrideMinor,
          context.actorId,
        ],
      );

      const policy = await this.buildPolicyContract(client, context.organizationId);
      await client.query(
        `insert into resource_audit_events
           (organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,before_state,after_state)
         values($1,$2,'organization_cit_policy',$1,$3,'upsert_policy',$4,$5,$6,$7)`,
        [
          context.organizationId,
          randomUUID(),
          upserted.rows[0]!.version,
          context.actorId,
          context.correlationId,
          before,
          { ...policy, reason: input.reason.trim() },
        ],
      );

      const response = { policy };
      await this.saveReplay(
        client,
        context.organizationId,
        idempotencyKey,
        operation,
        requestHash,
        response,
      );
      await client.query("commit");
      return { ...response, idempotencyReplayed: false };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async upsertRateTiers(
    context: CitPolicyContext,
    effectiveFromYear: number,
    input: UpsertOrganizationCitRateTiersRequest,
    idempotencyKey: string,
  ): Promise<UpsertCitPolicyResult> {
    const operation = "cit-policy:upsert-tiers";
    const requestHash = createHash("sha256")
      .update(JSON.stringify({ effectiveFromYear, input }))
      .digest("hex");

    const scheduleToValidate: CitRateSchedule = {
      effectiveFromYear,
      effectiveToYear: input.effectiveToYear ?? null,
      lawReference: input.lawReference?.trim() || "Law 67/2025/QH15",
      standardRateBps: 2000,
      source: "organization",
      tiers: input.tiers.map((tier, index) => ({
        tierOrder: index + 1,
        tierCode: tier.tierCode.trim(),
        label: tier.label.trim(),
        maxRevenueMinor: tier.maxRevenueMinor === null ? null : BigInt(tier.maxRevenueMinor),
        rateBps: tier.rateBps,
      })),
    };
    const validated = validateCitRateSchedule(scheduleToValidate);

    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const replay = await this.checkReplay<{ policy: OrganizationCitPolicyContract }>(
        client,
        context.organizationId,
        idempotencyKey,
        requestHash,
      );
      if (replay) {
        await client.query("commit");
        return { ...replay, idempotencyReplayed: true };
      }

      const prevVersionRes = await client.query<{ max_version: string | null }>(
        `select max(version)::text max_version from organization_cit_rate_tiers
          where organization_id=$1 and effective_from_year=$2`,
        [context.organizationId, validated.effectiveFromYear],
      );
      const nextVersion = (BigInt(prevVersionRes.rows[0]?.max_version ?? "0") + 1n).toString();

      await client.query(
        `delete from organization_cit_rate_tiers
          where organization_id=$1 and effective_from_year=$2`,
        [context.organizationId, validated.effectiveFromYear],
      );

      for (const tier of validated.tiers) {
        await client.query(
          `insert into organization_cit_rate_tiers
             (organization_id,effective_from_year,effective_to_year,tier_order,tier_code,label,max_revenue_minor,rate_bps,law_reference,updated_by,updated_at,version)
           values($1,$2,$3,$4,$5,$6,$7::bigint,$8,$9,$10,now(),$11::bigint)`,
          [
            context.organizationId,
            validated.effectiveFromYear,
            validated.effectiveToYear,
            tier.tierOrder,
            tier.tierCode,
            tier.label,
            tier.maxRevenueMinor === null ? null : tier.maxRevenueMinor.toString(),
            tier.rateBps,
            validated.lawReference,
            context.actorId,
            nextVersion,
          ],
        );
      }

      const policy = await this.buildPolicyContract(
        client,
        context.organizationId,
        validated.effectiveFromYear,
      );
      await client.query(
        `insert into resource_audit_events
           (organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,after_state)
         values($1,$2,'organization_cit_rate_tiers',$3,$4,'upsert_rate_tiers',$5,$6,$7)`,
        [
          context.organizationId,
          randomUUID(),
          `${context.organizationId}:${validated.effectiveFromYear}`,
          nextVersion,
          context.actorId,
          context.correlationId,
          { schedule: policy.effectiveSchedule, reason: input.reason.trim() },
        ],
      );

      const response = { policy };
      await this.saveReplay(
        client,
        context.organizationId,
        idempotencyKey,
        operation,
        requestHash,
        response,
      );
      await client.query("commit");
      return { ...response, idempotencyReplayed: false };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async estimateReport(
    organizationId: string,
    query: CitEstimateQuery,
  ): Promise<EstimatedCitReportContract> {
    return resolvePgCitEstimate(this.pool, organizationId, query);
  }
}
