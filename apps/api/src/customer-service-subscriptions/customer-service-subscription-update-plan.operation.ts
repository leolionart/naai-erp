import { randomUUID } from "node:crypto";
import { type PoolClient } from "pg";
import type { CustomerSubscriptionContext } from "./customer-service-subscription.types.js";
import { type Idempotency, hash } from "./pg-customer-service-subscription.store.shared.js";
import type { PgCustomerServiceSubscriptionStore } from "./pg-customer-service-subscription.store.js";

export function updatePlanOperation(
  this: PgCustomerServiceSubscriptionStore,
  c: CustomerSubscriptionContext,
  id: string,
  i: Record<string, unknown>,
  k: string,
) {
  return this.mutate(c, k, "service-plan:update", { id, i }, async (q) => {
    const before = await this.lockPlan(q, c.organizationId, id, i.expectedResourceVersion),
      r = i.recurrence as Record<string, unknown> | undefined;
    if (i.serviceLineCode !== undefined)
      await this.serviceLine(q, c.organizationId, i.serviceLineCode);
    const next = {
      code: i.code ?? before.code,
      name: i.name ?? before.name,
      serviceLineCode: i.serviceLineCode ?? before.service_line_code,
      price: i.defaultUnitPriceMinor ?? before.default_unit_price_minor,
      currency: i.currency ?? before.currency,
      frequency: r?.frequency ?? before.recurrence_frequency,
      interval: r?.interval ?? before.recurrence_interval,
      billingDay: r?.billingDay ?? before.billing_day,
    };
    const version = (BigInt(String(before.version)) + 1n).toString();
    await q.query(
      `update service_plans set code=$3,name=$4,service_line_code=$5,default_unit_price_minor=$6,currency=$7,recurrence_frequency=$8,recurrence_interval=$9,billing_day=$10,version=$11,updated_by=$12,updated_at=now() where organization_id=$1 and id=$2`,
      [
        c.organizationId,
        id,
        next.code,
        next.name,
        next.serviceLineCode,
        next.price,
        next.currency,
        next.frequency,
        next.interval,
        next.billingDay,
        version,
        c.actorId,
      ],
    );
    return this.result(
      q,
      c,
      "service_plan",
      id,
      "update",
      version,
      before,
      await this.planWith(q, c.organizationId, id),
    );
  });
}

export function createSubscriptionOperation(
  this: PgCustomerServiceSubscriptionStore,
  c: CustomerSubscriptionContext,
  i: Record<string, unknown>,
  k: string,
) {
  return this.mutate(c, k, "customer-subscription:create", i, async (q) => {
    const plan = await this.relationships(
        q,
        c.organizationId,
        i.customerPartyId,
        i.servicePlanId,
        i.projectId,
        false,
      ),
      r = (i.recurrence ?? plan.recurrence) as Record<string, unknown>,
      id = String(i.id ?? randomUUID());
    await q.query(
      `insert into customer_service_subscriptions(organization_id,id,customer_party_id,service_plan_id,project_id,starts_on,ends_on,quantity,unit_price_minor,currency,recurrence_frequency,recurrence_interval,billing_day,created_by,updated_by)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14)`,
      [
        c.organizationId,
        id,
        i.customerPartyId,
        i.servicePlanId,
        i.projectId ?? null,
        i.startsOn,
        i.endsOn ?? null,
        i.quantity,
        i.unitPriceMinor ?? plan.defaultUnitPriceMinor,
        i.currency ?? plan.currency,
        r.frequency,
        r.interval,
        r.billingDay,
        c.actorId,
      ],
    );
    return this.result(
      q,
      c,
      "customer_service_subscription",
      id,
      "create",
      "1",
      null,
      await this.subWith(q, c.organizationId, id),
    );
  });
}

export function updateSubscriptionOperation(
  this: PgCustomerServiceSubscriptionStore,
  c: CustomerSubscriptionContext,
  id: string,
  i: Record<string, unknown>,
  k: string,
) {
  return this.mutate(c, k, "customer-subscription:update", { id, i }, async (q) => {
    const before = await this.lockSub(q, c.organizationId, id, i.expectedResourceVersion);
    if (before.lifecycle !== "draft") throw new Error("SUBSCRIPTION_DRAFT_REQUIRED");
    const customer = i.customerPartyId ?? before.customer_party_id,
      planId = i.servicePlanId ?? before.service_plan_id,
      project = i.projectId === undefined ? before.project_id : i.projectId,
      plan = await this.relationships(q, c.organizationId, customer, planId, project, false),
      r = (i.recurrence ??
        (i.servicePlanId
          ? plan.recurrence
          : {
              frequency: before.recurrence_frequency,
              interval: before.recurrence_interval,
              billingDay: before.billing_day,
            })) as Record<string, unknown>,
      version = (BigInt(String(before.version)) + 1n).toString();
    await q.query(
      `update customer_service_subscriptions set customer_party_id=$3,service_plan_id=$4,project_id=$5,starts_on=$6,ends_on=$7,quantity=$8,unit_price_minor=$9,currency=$10,recurrence_frequency=$11,recurrence_interval=$12,billing_day=$13,version=$14,updated_by=$15,updated_at=now() where organization_id=$1 and id=$2`,
      [
        c.organizationId,
        id,
        customer,
        planId,
        project,
        i.startsOn ?? before.starts_on,
        i.endsOn === undefined ? before.ends_on : i.endsOn,
        i.quantity ?? before.quantity,
        i.unitPriceMinor ??
          (i.servicePlanId ? plan.defaultUnitPriceMinor : before.unit_price_minor),
        i.currency ?? (i.servicePlanId ? plan.currency : before.currency),
        r.frequency,
        r.interval,
        r.billingDay,
        version,
        c.actorId,
      ],
    );
    return this.result(
      q,
      c,
      "customer_service_subscription",
      id,
      "update",
      version,
      before,
      await this.subWith(q, c.organizationId, id),
    );
  });
}

export async function mutateOperation(
  this: PgCustomerServiceSubscriptionStore,
  c: CustomerSubscriptionContext,
  key: string,
  operation: string,
  payload: unknown,
  fn: (q: PoolClient) => Promise<Record<string, unknown>>,
) {
  const q = await this.pool.connect();
  try {
    await q.query("begin");
    await q.query("select pg_advisory_xact_lock(hashtext($1),hashtext($2))", [
      c.organizationId,
      key,
    ]);
    const requestHash = hash({ operation, payload });
    const replay = (
      await q.query<Idempotency>(
        `select request_hash,response_body from api_idempotency_records where organization_id=$1 and idempotency_key=$2 for update`,
        [c.organizationId, key],
      )
    ).rows[0];
    if (replay) {
      if (replay.request_hash !== requestHash) throw new Error("IDEMPOTENCY_CONFLICT");
      await q.query("commit");
      return {
        ...replay.response_body,
        mutation: { ...(replay.response_body.mutation as object), idempotencyReplayed: true },
      };
    }
    const response = await fn(q);
    await q.query(
      `insert into api_idempotency_records(organization_id,idempotency_key,operation,request_hash,response_body)values($1,$2,$3,$4,$5)`,
      [c.organizationId, key, operation, requestHash, response],
    );
    await q.query("commit");
    return response;
  } catch (e) {
    await q.query("rollback");
    throw e;
  } finally {
    q.release();
  }
}
