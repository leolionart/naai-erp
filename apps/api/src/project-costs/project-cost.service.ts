import { Inject, Injectable } from "@nestjs/common";
import { API_VERSION } from "@naai-erp/contracts";
import { MasterDataService } from "../master-data/master-data.service.js";
import {
  PROJECT_COST_STORE,
  type ProjectCostContext,
  type ProjectCostStore,
} from "./project-cost.types.js";
const WRITE = new Set(["owner", "finance_admin", "accountant", "project_manager"]),
  APPROVE = new Set(["owner", "finance_admin", "approver"]);
@Injectable()
export class ProjectCostService {
  constructor(
    @Inject(PROJECT_COST_STORE) private readonly store: ProjectCostStore,
    @Inject(MasterDataService) private readonly master: MasterDataService,
  ) {}
  authenticate(a: string | undefined, o: string, c: string) {
    return this.master.authenticate(a, o, c);
  }
  private e(c: ProjectCostContext, data: unknown) {
    return {
      apiVersion: API_VERSION,
      requestId: c.correlationId,
      organizationId: c.organizationId,
      data,
    };
  }
  private w(c: ProjectCostContext, k?: string, approve = false): asserts k is string {
    if (!c.roles.some((r) => (approve ? APPROVE : WRITE).has(r))) throw new Error("FORBIDDEN");
    if (!k) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
  }
  list(c: ProjectCostContext) {
    return this.store.listCosts(c.organizationId).then((x) => this.e(c, x));
  }
  async get(c: ProjectCostContext, id: string) {
    const x = await this.store.getCost(c.organizationId, id);
    if (!x) throw new Error("RESOURCE_NOT_FOUND");
    return this.e(c, x);
  }
  unallocated(c: ProjectCostContext) {
    return this.store.unallocated(c.organizationId).then((x) => this.e(c, x));
  }
  allocations(c: ProjectCostContext) {
    return this.store.listAllocations(c.organizationId).then((x) => this.e(c, x));
  }
  async allocation(c: ProjectCostContext, id: string) {
    const x = await this.store.getAllocation(c.organizationId, id);
    if (!x) throw new Error("RESOURCE_NOT_FOUND");
    return this.e(c, x);
  }
  async create(c: ProjectCostContext, i: Record<string, unknown>, k?: string) {
    this.w(c, k);
    if (
      i.schemaVersion !== 1 ||
      !String(i.sourceId ?? "").trim() ||
      !Array.isArray(i.splits) ||
      !i.splits.length ||
      !String(i.reason ?? "").trim()
    )
      throw new Error("VALIDATION_FAILED");
    return this.e(c, await this.store.createAllocation(c, i, k));
  }
  async transition(
    c: ProjectCostContext,
    id: string,
    a: string,
    i: Record<string, unknown>,
    k?: string,
  ) {
    if (!["submit", "approve", "post", "reverse"].includes(a))
      throw new Error("RESOURCE_NOT_FOUND");
    this.w(c, k, ["approve", "post", "reverse"].includes(a));
    if (
      i.schemaVersion !== 1 ||
      !/^\d+$/.test(String(i.expectedResourceVersion)) ||
      !String(i.reason ?? "").trim()
    )
      throw new Error("VALIDATION_FAILED");
    return this.e(c, await this.store.transition(c, id, a, i, k));
  }
}
