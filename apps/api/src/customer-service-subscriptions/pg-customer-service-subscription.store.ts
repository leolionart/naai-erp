import { createHash, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { subscriptionNextActions, transitionSubscription } from "@naai-erp/domain";
import pg, { type PoolClient } from "pg";
import type { CustomerSubscriptionContext } from "./customer-service-subscription.types.js";

const hash = (x: unknown) => createHash("sha256").update(JSON.stringify(x)).digest("hex");
type Idempotency = { request_hash: string; response_body: Record<string, unknown> };
@Injectable()
export class PgCustomerServiceSubscriptionStore {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  private planSql = `select id,code,name,service_line_code "serviceLineCode",default_unit_price_minor::text "defaultUnitPriceMinor",currency,jsonb_build_object('frequency',recurrence_frequency,'interval',recurrence_interval,'billingDay',billing_day) recurrence,active,version::text "resourceVersion" from service_plans`;
  private subSql = `select id,customer_party_id "customerPartyId",service_plan_id "servicePlanId",project_id "projectId",starts_on::text "startsOn",ends_on::text "endsOn",quantity::text,unit_price_minor::text "unitPriceMinor",currency,jsonb_build_object('frequency',recurrence_frequency,'interval',recurrence_interval,'billingDay',billing_day) "recurrenceSnapshot",lifecycle,version::text "resourceVersion" from customer_service_subscriptions`;
  async validatePortable(
    c: CustomerSubscriptionContext,
    resource: "service_plans" | "customer_service_subscriptions",
    i: Record<string, unknown>,
  ) {
    const q = await this.pool.connect();
    try {
      if (resource === "service_plans")
        await this.serviceLine(q, c.organizationId, i.serviceLineCode);
      else
        await this.relationships(
          q,
          c.organizationId,
          i.customerPartyId,
          i.servicePlanId,
          i.projectId,
          false,
        );
    } finally {
      q.release();
    }
  }
  async listPlans(c: CustomerSubscriptionContext, f: Record<string, string | undefined>) {
    const v: unknown[] = [c.organizationId];
    let w = "";
    if (f.active !== undefined) {
      v.push(f.active === "true");
      w += ` and active=$${v.length}`;
    }
    if (f.serviceLineCode) {
      v.push(f.serviceLineCode);
      w += ` and service_line_code=$${v.length}`;
    }
    const limit = Math.min(Math.max(Number(f.limit) || 50, 1), 200),
      offset = Math.max(Number(f.offset) || 0, 0);
    const rows = (
      await this.pool.query(
        `${this.planSql} where organization_id=$1${w} order by name,id limit ${limit} offset ${offset}`,
        v,
      )
    ).rows;
    return { items: rows.map((x) => this.plan(x)), limit, offset };
  }
  async getPlan(c: CustomerSubscriptionContext, id: string) {
    const x = (
      await this.pool.query(`${this.planSql} where organization_id=$1 and id=$2`, [
        c.organizationId,
        id,
      ])
    ).rows[0];
    return x ? this.plan(x) : undefined;
  }
  createPlan(c: CustomerSubscriptionContext, i: Record<string, unknown>, k: string) {
    return this.mutate(c, k, "service-plan:create", i, async (q) => {
      const r = i.recurrence as Record<string, unknown>,
        id = String(i.id ?? randomUUID()),
        code = await this.availablePlanCode(q, c.organizationId, String(i.code)),
        serviceLineCode = await this.resolveServiceLine(q, c.organizationId, i.serviceLineCode);
      await q.query(
        `insert into service_plans(organization_id,id,code,name,service_line_code,default_unit_price_minor,currency,recurrence_frequency,recurrence_interval,billing_day,created_by,updated_by)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)`,
        [
          c.organizationId,
          id,
          code,
          i.name,
          serviceLineCode,
          i.defaultUnitPriceMinor,
          i.currency,
          r.frequency,
          r.interval,
          r.billingDay,
          c.actorId,
        ],
      );
      return this.result(
        q,
        c,
        "service_plan",
        id,
        "create",
        "1",
        null,
        await this.planWith(q, c.organizationId, id),
      );
    });
  }
  updatePlan(c: CustomerSubscriptionContext, id: string, i: Record<string, unknown>, k: string) {
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
  deactivatePlan(
    c: CustomerSubscriptionContext,
    id: string,
    i: Record<string, unknown>,
    k: string,
  ) {
    return this.mutate(c, k, "service-plan:deactivate", { id, i }, async (q) => {
      const before = await this.lockPlan(q, c.organizationId, id, i.expectedResourceVersion),
        version = (BigInt(String(before.version)) + 1n).toString();
      await q.query(
        `update service_plans set active=false,version=$3,updated_by=$4,updated_at=now() where organization_id=$1 and id=$2`,
        [c.organizationId, id, version, c.actorId],
      );
      return this.result(
        q,
        c,
        "service_plan",
        id,
        "deactivate",
        version,
        before,
        await this.planWith(q, c.organizationId, id),
      );
    });
  }
  async listSubscriptions(c: CustomerSubscriptionContext, f: Record<string, string | undefined>) {
    const v: unknown[] = [c.organizationId];
    let w = "";
    for (const [key, col] of [
      ["customerPartyId", "customer_party_id"],
      ["servicePlanId", "service_plan_id"],
      ["projectId", "project_id"],
      ["lifecycle", "lifecycle"],
    ] as const)
      if (f[key]) {
        v.push(f[key]);
        w += ` and ${col}=$${v.length}`;
      }
    if (f.activeOn) {
      v.push(f.activeOn);
      w += ` and starts_on<=$${v.length} and (ends_on is null or ends_on>=$${v.length}) and lifecycle in('active','paused')`;
    }
    const limit = Math.min(Math.max(Number(f.limit) || 50, 1), 200),
      offset = Math.max(Number(f.offset) || 0, 0);
    const rows = (
      await this.pool.query(
        `${this.subSql} where organization_id=$1${w} order by starts_on desc,id limit ${limit} offset ${offset}`,
        v,
      )
    ).rows;
    return { items: rows.map((x) => this.sub(x)), limit, offset };
  }
  async getSubscription(c: CustomerSubscriptionContext, id: string) {
    const x = (
      await this.pool.query(`${this.subSql} where organization_id=$1 and id=$2`, [
        c.organizationId,
        id,
      ])
    ).rows[0];
    return x ? this.sub(x) : undefined;
  }
  createSubscription(c: CustomerSubscriptionContext, i: Record<string, unknown>, k: string) {
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
  updateSubscription(
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
  transition(
    c: CustomerSubscriptionContext,
    id: string,
    action: string,
    i: Record<string, unknown>,
    k: string,
  ) {
    return this.mutate(c, k, `customer-subscription:${action}`, { id, i }, async (q) => {
      const before = await this.lockSub(q, c.organizationId, id, i.expectedResourceVersion);
      if (action === "activate")
        await this.relationships(
          q,
          c.organizationId,
          before.customer_party_id,
          before.service_plan_id,
          before.project_id,
          true,
        );
      const lifecycle = transitionSubscription(before.lifecycle, action as never),
        version = (BigInt(String(before.version)) + 1n).toString();
      await q.query(
        `update customer_service_subscriptions set lifecycle=$3,lifecycle_effective_on=$4,lifecycle_reason=$5,version=$6,updated_by=$7,updated_at=now() where organization_id=$1 and id=$2`,
        [c.organizationId, id, lifecycle, i.effectiveOn, i.reason, version, c.actorId],
      );
      return this.result(
        q,
        c,
        "customer_service_subscription",
        id,
        action,
        version,
        before,
        await this.subWith(q, c.organizationId, id),
      );
    });
  }
  private plan(x: Record<string, unknown>) {
    return { ...x, nextActions: x.active ? ["update", "deactivate"] : [] };
  }
  private sub(x: Record<string, unknown>) {
    return {
      ...x,
      nextActions: [
        ...(x.lifecycle === "draft" ? ["update"] : []),
        ...subscriptionNextActions(x.lifecycle as never),
        "schedule-preview",
      ],
    };
  }
  private async planWith(q: PoolClient, o: string, id: string) {
    return this.plan(
      (await q.query(`${this.planSql} where organization_id=$1 and id=$2`, [o, id])).rows[0],
    );
  }
  private async subWith(q: PoolClient, o: string, id: string) {
    return this.sub(
      (await q.query(`${this.subSql} where organization_id=$1 and id=$2`, [o, id])).rows[0],
    );
  }
  private async lockPlan(q: PoolClient, o: string, id: string, v: unknown) {
    const x = (
      await q.query(`select * from service_plans where organization_id=$1 and id=$2 for update`, [
        o,
        id,
      ])
    ).rows[0];
    if (!x) throw new Error("RESOURCE_NOT_FOUND");
    if (String(x.version) !== String(v)) throw new Error("VERSION_CONFLICT");
    return x;
  }
  private async lockSub(q: PoolClient, o: string, id: string, v: unknown) {
    const x = (
      await q.query(
        `select * from customer_service_subscriptions where organization_id=$1 and id=$2 for update`,
        [o, id],
      )
    ).rows[0];
    if (!x) throw new Error("RESOURCE_NOT_FOUND");
    if (String(x.version) !== String(v)) throw new Error("VERSION_CONFLICT");
    return x;
  }
  private async serviceLine(q: PoolClient, o: string, code: unknown) {
    if (
      !(
        await q.query(
          `select 1 from dimension_values where organization_id=$1 and kind='service_line' and code=$2 and is_active`,
          [o, code],
        )
      ).rows[0]
    )
      throw new Error("SERVICE_LINE_NOT_FOUND");
  }
  private async resolveServiceLine(q: PoolClient, o: string, requested: unknown) {
    if (requested !== undefined && String(requested).trim()) {
      await this.serviceLine(q, o, requested);
      return String(requested);
    }
    const selected = (
      await q.query<{ code: string }>(
        `select code from dimension_values where organization_id=$1 and kind='service_line' and is_active
         order by case code when 'RETAINER_FEE' then 0 when 'SYSTEM_MAINTENANCE' then 1 else 2 end,code limit 1`,
        [o],
      )
    ).rows[0];
    if (!selected) throw new Error("SERVICE_LINE_REQUIRED");
    return selected.code;
  }
  private async availablePlanCode(q: PoolClient, o: string, base: string) {
    await q.query("select pg_advisory_xact_lock(hashtext($1),hashtext($2))", [
      `service-plan-code:${o}`,
      base,
    ]);
    const rows = (
      await q.query<{ code: string }>(
        `select code from service_plans where organization_id=$1 and (code=$2 or code like $2 || '-%')`,
        [o, base],
      )
    ).rows;
    const used = new Set(rows.map((row) => row.code));
    if (!used.has(base)) return base;
    let suffix = 2;
    while (used.has(`${base}-${suffix}`)) suffix += 1;
    return `${base}-${suffix}`;
  }
  private async relationships(
    q: PoolClient,
    o: string,
    customer: unknown,
    planId: unknown,
    project: unknown,
    activation: boolean,
  ) {
    const client = (
      await q.query(
        `select 1 from party_roles r join parties p on p.organization_id=r.organization_id and p.id=r.party_id where r.organization_id=$1 and r.party_id=$2 and r.role='client' and p.status='active'`,
        [o, customer],
      )
    ).rows[0];
    if (!client) throw new Error("CUSTOMER_CLIENT_ROLE_REQUIRED");
    const plan = (
      await q.query(
        `select default_unit_price_minor::text "defaultUnitPriceMinor",currency,jsonb_build_object('frequency',recurrence_frequency,'interval',recurrence_interval,'billingDay',billing_day) recurrence,active from service_plans where organization_id=$1 and id=$2`,
        [o, planId],
      )
    ).rows[0];
    if (!plan) throw new Error("SERVICE_PLAN_NOT_FOUND");
    if (activation && !plan.active) throw new Error("SERVICE_PLAN_INACTIVE");
    if (project) {
      const p = (
        await q.query(`select client_party_id from projects where organization_id=$1 and id=$2`, [
          o,
          project,
        ])
      ).rows[0];
      if (!p) throw new Error("PROJECT_NOT_FOUND");
      if (p.client_party_id !== customer) throw new Error("CUSTOMER_PROJECT_MISMATCH");
    }
    return plan;
  }
  private async result(
    q: PoolClient,
    c: CustomerSubscriptionContext,
    type: string,
    id: string,
    action: string,
    version: string,
    before: Record<string, unknown> | null,
    resource: Record<string, unknown>,
  ) {
    const auditEventId = randomUUID();
    await q.query(
      `insert into resource_audit_events(organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,before_state,after_state)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        c.organizationId,
        auditEventId,
        type,
        id,
        version,
        action,
        c.actorId,
        c.correlationId,
        before,
        resource,
      ],
    );
    return {
      resource,
      mutation: {
        resourceVersion: version,
        auditEventId,
        correlationId: c.correlationId,
        idempotencyReplayed: false,
        nextActions: resource.nextActions,
      },
    };
  }
  private async mutate(
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
}
