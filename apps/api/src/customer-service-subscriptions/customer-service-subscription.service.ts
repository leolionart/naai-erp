import { Inject, Injectable } from "@nestjs/common";
import { API_VERSION } from "@naai-erp/contracts";
import { assertExactMoney, assertRecurrence, buildSubscriptionSchedule } from "@naai-erp/domain";
import { MasterDataService } from "../master-data/master-data.service.js";
import {
  CUSTOMER_SUBSCRIPTION_STORE,
  type CustomerSubscriptionContext,
  type CustomerSubscriptionStore,
} from "./customer-service-subscription.types.js";

const WRITE = new Set(["owner", "finance_admin", "accountant", "project_manager"]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
@Injectable()
export class CustomerServiceSubscriptionService {
  constructor(
    @Inject(CUSTOMER_SUBSCRIPTION_STORE) private readonly store: CustomerSubscriptionStore,
    @Inject(MasterDataService) private readonly master: MasterDataService,
  ) {}
  authenticate(auth: string | undefined, org: string, correlation: string) {
    return this.master.authenticate(auth, org, correlation);
  }
  private envelope(c: CustomerSubscriptionContext, data: unknown) {
    return {
      apiVersion: API_VERSION,
      requestId: c.correlationId,
      organizationId: c.organizationId,
      data,
    };
  }
  private authorize(c: CustomerSubscriptionContext, key?: string): asserts key is string {
    if (!c.roles.some((r) => WRITE.has(r))) throw new Error("FORBIDDEN");
    if (!key?.trim()) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
  }
  private mutation(input: Record<string, unknown>) {
    if (
      input.schemaVersion !== 1 ||
      !/^\d+$/.test(String(input.expectedResourceVersion)) ||
      !String(input.reason ?? "").trim()
    )
      throw new Error("VALIDATION_FAILED");
  }
  private plan(input: Record<string, unknown>, update = false) {
    if (input.schemaVersion !== 1 || !String(input.reason ?? "").trim())
      throw new Error("VALIDATION_FAILED");
    for (const key of ["code", "name", "serviceLineCode"] as const)
      if (!update || input[key] !== undefined)
        if (!String(input[key] ?? "").trim()) throw new Error("VALIDATION_FAILED");
    if (!update || input.defaultUnitPriceMinor !== undefined)
      assertExactMoney(String(input.defaultUnitPriceMinor));
    if (!update || input.currency !== undefined)
      if (!/^[A-Z]{3}$/.test(String(input.currency))) throw new Error("VALIDATION_FAILED");
    if (!update || input.recurrence !== undefined) assertRecurrence(input.recurrence as never);
  }
  private subscription(input: Record<string, unknown>, update = false) {
    if (input.schemaVersion !== 1 || !String(input.reason ?? "").trim())
      throw new Error("VALIDATION_FAILED");
    for (const key of ["customerPartyId", "servicePlanId", "startsOn", "quantity"] as const)
      if (!update || input[key] !== undefined)
        if (!String(input[key] ?? "").trim()) throw new Error("VALIDATION_FAILED");
    if (input.startsOn !== undefined && !DATE.test(String(input.startsOn)))
      throw new Error("VALIDATION_FAILED");
    if (input.endsOn !== undefined && input.endsOn !== null && !DATE.test(String(input.endsOn)))
      throw new Error("VALIDATION_FAILED");
    if (
      input.startsOn !== undefined &&
      input.endsOn !== undefined &&
      input.endsOn !== null &&
      String(input.endsOn) < String(input.startsOn)
    )
      throw new Error("VALIDATION_FAILED");
    if (input.quantity !== undefined && assertExactMoney(String(input.quantity)) < 1n)
      throw new Error("VALIDATION_FAILED");
    if (input.unitPriceMinor !== undefined) assertExactMoney(String(input.unitPriceMinor));
    if (input.currency !== undefined && !/^[A-Z]{3}$/.test(String(input.currency)))
      throw new Error("VALIDATION_FAILED");
    if (input.recurrence !== undefined) assertRecurrence(input.recurrence as never);
  }
  listPlans(c: CustomerSubscriptionContext, f: Record<string, string | undefined>) {
    return this.store.listPlans(c, f).then((x) => this.envelope(c, x));
  }
  async getPlan(c: CustomerSubscriptionContext, id: string) {
    const x = await this.store.getPlan(c, id);
    if (!x) throw new Error("RESOURCE_NOT_FOUND");
    return this.envelope(c, x);
  }
  async createPlan(c: CustomerSubscriptionContext, i: Record<string, unknown>, k?: string) {
    this.authorize(c, k);
    this.plan(i);
    return this.envelope(c, await this.store.createPlan(c, i, k));
  }
  async updatePlan(
    c: CustomerSubscriptionContext,
    id: string,
    i: Record<string, unknown>,
    k?: string,
  ) {
    this.authorize(c, k);
    this.plan(i, true);
    this.mutation(i);
    return this.envelope(c, await this.store.updatePlan(c, id, i, k));
  }
  async deactivatePlan(
    c: CustomerSubscriptionContext,
    id: string,
    i: Record<string, unknown>,
    k?: string,
  ) {
    this.authorize(c, k);
    this.mutation(i);
    return this.envelope(c, await this.store.deactivatePlan(c, id, i, k));
  }
  listSubscriptions(c: CustomerSubscriptionContext, f: Record<string, string | undefined>) {
    return this.store.listSubscriptions(c, f).then((x) => this.envelope(c, x));
  }
  async getSubscription(c: CustomerSubscriptionContext, id: string) {
    const x = await this.store.getSubscription(c, id);
    if (!x) throw new Error("RESOURCE_NOT_FOUND");
    return this.envelope(c, x);
  }
  async createSubscription(c: CustomerSubscriptionContext, i: Record<string, unknown>, k?: string) {
    this.authorize(c, k);
    this.subscription(i);
    return this.envelope(c, await this.store.createSubscription(c, i, k));
  }
  async updateSubscription(
    c: CustomerSubscriptionContext,
    id: string,
    i: Record<string, unknown>,
    k?: string,
  ) {
    this.authorize(c, k);
    this.subscription(i, true);
    this.mutation(i);
    return this.envelope(c, await this.store.updateSubscription(c, id, i, k));
  }
  async transition(
    c: CustomerSubscriptionContext,
    id: string,
    action: string,
    i: Record<string, unknown>,
    k?: string,
  ) {
    if (!["activate", "pause", "resume", "cancel", "expire"].includes(action))
      throw new Error("RESOURCE_NOT_FOUND");
    this.authorize(c, k);
    this.mutation(i);
    if (!DATE.test(String(i.effectiveOn ?? ""))) throw new Error("VALIDATION_FAILED");
    return this.envelope(c, await this.store.transition(c, id, action, i, k));
  }
  async preview(c: CustomerSubscriptionContext, id: string, through: string) {
    if (!DATE.test(through)) throw new Error("VALIDATION_FAILED");
    const s = await this.store.getSubscription(c, id);
    if (!s) throw new Error("RESOURCE_NOT_FOUND");
    return this.envelope(c, {
      accountingNeutral: true,
      subscriptionId: id,
      generatedThrough: through,
      periods: buildSubscriptionSchedule({
        startsOn: String(s.startsOn),
        endsOn: s.endsOn as string | null,
        previewThrough: through,
        lifecycle: s.lifecycle as never,
        recurrence: s.recurrenceSnapshot as never,
        quantity: String(s.quantity),
        unitPriceMinor: String(s.unitPriceMinor),
        currency: String(s.currency),
      }),
    });
  }
  async validatePortableInput(
    c: CustomerSubscriptionContext,
    resource: "service_plans" | "customer_service_subscriptions",
    input: Record<string, unknown>,
  ) {
    if (resource === "service_plans") this.plan(input);
    else this.subscription(input);
    await this.store.validatePortable(c, resource, input);
    return { valid: true as const };
  }
}
