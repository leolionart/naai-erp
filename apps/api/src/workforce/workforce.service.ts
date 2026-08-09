import { Inject, Injectable } from "@nestjs/common";
import { API_VERSION } from "@naai-erp/contracts";
import { MasterDataService } from "../master-data/master-data.service.js";
import {
  WORKFORCE_STORE,
  type MutationInput,
  type WorkforceContext,
  type WorkforceStore,
} from "./workforce.types.js";

const WRITE = new Set(["owner", "finance_admin", "accountant", "project_manager"]);
const APPROVE = new Set(["owner", "finance_admin", "approver"]);
@Injectable()
export class WorkforceService {
  constructor(
    @Inject(WORKFORCE_STORE) private readonly store: WorkforceStore,
    @Inject(MasterDataService) private readonly master: MasterDataService,
  ) {}
  authenticate(a: string | undefined, o: string, c: string) {
    return this.master.authenticate(a, o, c);
  }
  private envelope(c: WorkforceContext, data: unknown) {
    return {
      apiVersion: API_VERSION,
      requestId: c.correlationId,
      organizationId: c.organizationId,
      data,
    };
  }
  private authorize(c: WorkforceContext, key?: string, approve = false): asserts key is string {
    if (!c.roles.some((r) => (approve ? APPROVE : WRITE).has(r))) throw new Error("FORBIDDEN");
    if (!key) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
  }
  private mutation(i: Record<string, unknown>): asserts i is MutationInput {
    if (
      i.schemaVersion !== 1 ||
      !/^\d+$/.test(String(i.expectedResourceVersion)) ||
      !String(i.reason ?? "").trim()
    )
      throw new Error("VALIDATION_FAILED");
  }
  async listWorkers(c: WorkforceContext) {
    return this.envelope(c, await this.store.listWorkers(c.organizationId));
  }
  async createWorker(c: WorkforceContext, i: Record<string, unknown>, k?: string) {
    this.authorize(c, k);
    if (
      i.schemaVersion !== 1 ||
      !String(i.workerPartyId ?? "").trim() ||
      !["employee", "freelancer", "contractor"].includes(String(i.employmentKind)) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(String(i.startsOn))
    )
      throw new Error("VALIDATION_FAILED");
    return this.envelope(c, await this.store.createWorker(c, i, k));
  }
  async updateWorker(
    c: WorkforceContext,
    id: string,
    i: Record<string, unknown>,
    k?: string,
    deactivate = false,
  ) {
    this.authorize(c, k);
    this.mutation(i);
    if (!deactivate && i.employmentKind === undefined && i.endsOn === undefined)
      throw new Error("VALIDATION_FAILED");
    if (
      i.employmentKind !== undefined &&
      !["employee", "freelancer", "contractor"].includes(String(i.employmentKind))
    )
      throw new Error("VALIDATION_FAILED");
    if (
      i.endsOn !== undefined &&
      i.endsOn !== null &&
      !/^\d{4}-\d{2}-\d{2}$/.test(String(i.endsOn))
    )
      throw new Error("VALIDATION_FAILED");
    return this.envelope(c, await this.store.updateWorker(c, id, i, k, deactivate));
  }
  async listTimesheets(c: WorkforceContext, q: Record<string, string | undefined>) {
    return this.envelope(c, await this.store.listTimesheets(c.organizationId, q));
  }
  async getTimesheet(c: WorkforceContext, id: string) {
    const d = await this.store.getTimesheet(c.organizationId, id);
    if (!d) throw new Error("RESOURCE_NOT_FOUND");
    return this.envelope(c, d);
  }
  async createTimesheet(c: WorkforceContext, i: Record<string, unknown>, k?: string) {
    this.authorize(c, k);
    if (
      i.schemaVersion !== 1 ||
      !String(i.workerId ?? "").trim() ||
      !/^\d{4}-\d{2}-\d{2}$/.test(String(i.weekStartsOn)) ||
      !Array.isArray(i.entries) ||
      !i.entries.length ||
      !String(i.reason ?? "").trim()
    )
      throw new Error("VALIDATION_FAILED");
    return this.envelope(c, await this.store.createTimesheet(c, i, k));
  }
  async transition(
    c: WorkforceContext,
    id: string,
    action: string,
    i: Record<string, unknown>,
    k?: string,
  ) {
    if (!["submit", "approve", "lock", "mark-billed", "reject", "revise"].includes(action))
      throw new Error("RESOURCE_NOT_FOUND");
    this.authorize(c, k, ["approve", "lock", "mark-billed", "reject"].includes(action));
    this.mutation(i);
    if (action === "mark-billed" && !String(i.billingReference ?? "").trim())
      throw new Error("VALIDATION_FAILED");
    return this.envelope(c, await this.store.transitionTimesheet(c, id, action, i, k));
  }
  async adjustment(c: WorkforceContext, id: string, i: Record<string, unknown>, k?: string) {
    this.authorize(c, k);
    if (
      i.schemaVersion !== 1 ||
      !String(i.originalEntryId ?? "").trim() ||
      !/^\d{4}-\d{2}-\d{2}$/.test(String(i.workDate)) ||
      !Number.isInteger(i.minutesDelta) ||
      i.minutesDelta === 0 ||
      !/^\d+$/.test(String(i.expectedResourceVersion)) ||
      !String(i.reason ?? "").trim()
    )
      throw new Error("VALIDATION_FAILED");
    return this.envelope(c, await this.store.createAdjustment(c, id, i, k));
  }
  async reviewAdjustment(
    c: WorkforceContext,
    id: string,
    aid: string,
    action: string,
    i: Record<string, unknown>,
    k?: string,
  ) {
    if (!["submit", "approve", "reject"].includes(action)) throw new Error("RESOURCE_NOT_FOUND");
    this.authorize(c, k, action !== "submit");
    this.mutation(i);
    return this.envelope(c, await this.store.reviewAdjustment(c, id, aid, action, i, k));
  }
  async listRates(c: WorkforceContext, workerId?: string) {
    if (!c.roles.some((r) => new Set(["owner", "finance_admin", "accountant"]).has(r)))
      throw new Error("FORBIDDEN");
    return this.envelope(c, await this.store.listRates(c.organizationId, workerId));
  }
  async createRate(c: WorkforceContext, i: Record<string, unknown>, k?: string) {
    this.authorize(c, k);
    if (
      i.schemaVersion !== 1 ||
      !String(i.workerId ?? "").trim() ||
      !["gross_salary", "fully_loaded", "blended"].includes(String(i.basis)) ||
      !/^\d+$/.test(String(i.rateMinorPerHour)) ||
      !/^[A-Z]{3}$/.test(String(i.currency)) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(String(i.effectiveFrom))
    )
      throw new Error("VALIDATION_FAILED");
    return this.envelope(c, await this.store.createRate(c, i, k));
  }
  async reviewRate(
    c: WorkforceContext,
    id: string,
    action: string,
    i: Record<string, unknown>,
    k?: string,
  ) {
    if (!["approve", "retire"].includes(action)) throw new Error("RESOURCE_NOT_FOUND");
    this.authorize(c, k, true);
    this.mutation(i);
    return this.envelope(c, await this.store.reviewRate(c, id, action, i, k));
  }
  async listCapacity(c: WorkforceContext, workerId?: string) {
    return this.envelope(c, await this.store.listCapacity(c.organizationId, workerId));
  }
  async createCapacity(c: WorkforceContext, i: Record<string, unknown>, k?: string) {
    this.authorize(c, k);
    if (
      i.schemaVersion !== 1 ||
      !String(i.workerId ?? "").trim() ||
      !Number.isInteger(i.weeklyCapacityMinutes) ||
      Number(i.weeklyCapacityMinutes) < 0 ||
      Number(i.weeklyCapacityMinutes) > 10080 ||
      !Array.isArray(i.workdays) ||
      !i.workdays.every((day) => Number.isInteger(day) && Number(day) >= 1 && Number(day) <= 7) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(String(i.effectiveFrom)) ||
      !String(i.reason ?? "").trim()
    )
      throw new Error("VALIDATION_FAILED");
    return this.envelope(c, await this.store.createCapacity(c, i, k));
  }
  async summary(c: WorkforceContext, q: Record<string, string | undefined>) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(q.from ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(q.to ?? ""))
      throw new Error("VALIDATION_FAILED");
    return this.envelope(c, await this.store.capacitySummary(c.organizationId, q));
  }
}
