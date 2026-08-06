import { Inject, Injectable } from "@nestjs/common";
import { API_VERSION } from "@naai-erp/contracts";
import { MasterDataService } from "../master-data/master-data.service.js";
import {
  FORECAST_COMPONENT_STORE,
  type ForecastComponentContext,
  type ForecastComponentStore,
} from "./forecast-component.types.js";

const WRITE = new Set(["owner", "finance_admin", "accountant", "project_manager"]);
const REVIEW = new Set(["owner", "finance_admin", "approver"]);

@Injectable()
export class ForecastComponentService {
  constructor(
    @Inject(FORECAST_COMPONENT_STORE) private readonly store: ForecastComponentStore,
    @Inject(MasterDataService) private readonly master: MasterDataService,
  ) {}
  authenticate(auth: string | undefined, org: string, correlation: string) {
    return this.master.authenticate(auth, org, correlation);
  }
  private envelope(c: ForecastComponentContext, data: unknown) {
    return {
      apiVersion: API_VERSION,
      requestId: c.correlationId,
      organizationId: c.organizationId,
      data,
    };
  }
  private authorize(
    c: ForecastComponentContext,
    key: string | undefined,
    review = false,
  ): asserts key is string {
    if (!c.roles.some((role) => (review ? REVIEW : WRITE).has(role))) throw new Error("FORBIDDEN");
    if (!key?.trim()) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
  }
  list(
    c: ForecastComponentContext,
    forecastId: string,
    filters: Record<string, string | undefined>,
  ) {
    return this.store.list(c, forecastId, filters).then((data) => this.envelope(c, data));
  }
  async get(c: ForecastComponentContext, forecastId: string, id: string) {
    const data = await this.store.get(c, forecastId, id);
    if (!data) throw new Error("RESOURCE_NOT_FOUND");
    return this.envelope(c, data);
  }
  composition(c: ForecastComponentContext, forecastId: string) {
    return this.store.composition(c, forecastId).then((data) => this.envelope(c, data));
  }
  async create(
    c: ForecastComponentContext,
    forecastId: string,
    input: Record<string, unknown>,
    key?: string,
  ) {
    this.authorize(c, key);
    this.validate(input, false);
    return this.envelope(c, await this.store.create(c, forecastId, input, key));
  }
  async update(
    c: ForecastComponentContext,
    forecastId: string,
    id: string,
    input: Record<string, unknown>,
    key?: string,
  ) {
    this.authorize(c, key);
    this.validate(input, true);
    return this.envelope(c, await this.store.update(c, forecastId, id, input, key));
  }
  async remove(
    c: ForecastComponentContext,
    forecastId: string,
    id: string,
    input: Record<string, unknown>,
    key?: string,
  ) {
    this.authorize(c, key);
    this.validateMutation(input);
    return this.envelope(c, await this.store.remove(c, forecastId, id, input, key));
  }
  async transition(
    c: ForecastComponentContext,
    forecastId: string,
    id: string,
    action: string,
    input: Record<string, unknown>,
    key?: string,
  ) {
    if (action !== "review" && action !== "exclude") throw new Error("RESOURCE_NOT_FOUND");
    this.authorize(c, key, action === "review");
    this.validateMutation(input);
    return this.envelope(c, await this.store.transition(c, forecastId, id, action, input, key));
  }
  private validateMutation(input: Record<string, unknown>) {
    if (
      input.schemaVersion !== 1 ||
      !/^\d+$/.test(String(input.expectedResourceVersion)) ||
      !String(input.reason ?? "").trim()
    )
      throw new Error("VALIDATION_FAILED");
  }
  private validate(input: Record<string, unknown>, update: boolean) {
    if (input.schemaVersion !== 1 || !String(input.reason ?? "").trim())
      throw new Error("VALIDATION_FAILED");
    if (update && !/^\d+$/.test(String(input.expectedResourceVersion)))
      throw new Error("VALIDATION_FAILED");
    if (update) {
      if (
        input.amountMinor !== undefined &&
        (!/^\d+$/.test(String(input.amountMinor)) || BigInt(String(input.amountMinor)) < 0n)
      )
        throw new Error("VALIDATION_FAILED");
      if (input.probabilityBps !== undefined) {
        const probability = Number(input.probabilityBps);
        if (!Number.isInteger(probability) || probability < 0 || probability > 10000)
          throw new Error("VALIDATION_FAILED");
      }
      return;
    }
    const section = String(input.section),
      kind = String(input.kind),
      direction = String(input.direction);
    const allowed: Record<string, string[]> = {
      revenue: [
        "committed_milestone",
        "scheduled_recurring",
        "weighted_pipeline",
        "manual_adjustment",
      ],
      expense: ["payroll", "recurring_opex", "manual_adjustment"],
      cash: [
        "opening_cash",
        "expected_collection",
        "financing",
        "payroll",
        "ap_due",
        "recurring_expense",
        "tax",
        "capex",
        "manual_adjustment",
      ],
    };
    if (
      !allowed[section]?.includes(kind) ||
      !["increase", "decrease"].includes(direction) ||
      !/^\d+$/.test(String(input.amountMinor)) ||
      BigInt(String(input.amountMinor)) < 0n
    )
      throw new Error("VALIDATION_FAILED");
    const probability = Number(input.probabilityBps ?? 10000);
    if (
      !Number.isInteger(probability) ||
      probability < 0 ||
      probability > 10000 ||
      (kind !== "weighted_pipeline" && probability !== 10000)
    )
      throw new Error("VALIDATION_FAILED");
    const source = (input.source ?? {}) as Record<string, unknown>;
    if (
      !String(source.type ?? "").trim() ||
      !String(source.id ?? "").trim() ||
      !String(input.scheduledOn ?? "").trim() ||
      !String(input.currency ?? "").trim()
    )
      throw new Error("VALIDATION_FAILED");
    if (
      String(source.type ?? "") === "owner_funding" &&
      !(section === "cash" && kind === "financing" && direction === "increase")
    )
      throw new Error("OWNER_FUNDING_MUST_BE_FINANCING");
  }
}
