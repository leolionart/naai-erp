import { Inject, Injectable } from "@nestjs/common";
import { API_VERSION } from "@naai-erp/contracts";
import { MasterDataService } from "../master-data/master-data.service.js";
import {
  OVERHEAD_ALLOCATION_STORE,
  type OverheadAllocationStore,
  type OverheadContext,
  type OverheadResource,
} from "./overhead-allocation.types.js";
const WRITE = new Set(["owner", "finance_admin", "accountant", "project_manager"]),
  APPROVE = new Set(["owner", "finance_admin", "approver"]);
const ACTIONS: Record<OverheadResource, readonly string[]> = {
  "overhead-allocation-policies": ["submit", "approve", "reject"],
  "overhead-source-pools": [],
  "overhead-allocation-runs": ["submit", "approve", "reject", "post", "reverse"],
};
@Injectable()
export class OverheadAllocationService {
  constructor(
    @Inject(OVERHEAD_ALLOCATION_STORE) private readonly store: OverheadAllocationStore,
    @Inject(MasterDataService) private readonly master: MasterDataService,
  ) {}
  authenticate(a: string | undefined, o: string, c: string) {
    return this.master.authenticate(a, o, c);
  }
  private e(c: OverheadContext, data: unknown) {
    return {
      apiVersion: API_VERSION,
      requestId: c.correlationId,
      organizationId: c.organizationId,
      data,
    };
  }
  private w(c: OverheadContext, key?: string, approve = false): asserts key is string {
    if (!c.roles.some((r) => (approve ? APPROVE : WRITE).has(r))) throw new Error("FORBIDDEN");
    if (!key?.trim()) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
  }
  list(c: OverheadContext, r: OverheadResource, f: Record<string, string | undefined>) {
    return this.store.list(c, r, f).then((x) => this.e(c, x));
  }
  async get(c: OverheadContext, r: OverheadResource, id: string) {
    const x = await this.store.get(c, r, id);
    if (!x) throw new Error("RESOURCE_NOT_FOUND");
    return this.e(c, x);
  }
  async create(c: OverheadContext, r: OverheadResource, i: Record<string, unknown>, key?: string) {
    this.w(c, key);
    if (i.schemaVersion !== 1 || !String(i.reason ?? "").trim())
      throw new Error("VALIDATION_FAILED");
    return this.e(c, await this.store.create(c, r, i, key));
  }
  async transition(
    c: OverheadContext,
    r: OverheadResource,
    id: string,
    a: string,
    i: Record<string, unknown>,
    key?: string,
  ) {
    if (!ACTIONS[r]?.includes(a)) throw new Error("RESOURCE_NOT_FOUND");
    this.w(c, key, ["approve", "reject", "post", "reverse"].includes(a));
    if (
      i.schemaVersion !== 1 ||
      !/^\d+$/.test(String(i.expectedResourceVersion)) ||
      !String(i.reason ?? "").trim()
    )
      throw new Error("VALIDATION_FAILED");
    return this.e(c, await this.store.transition(c, r, id, a, i, key));
  }
}
