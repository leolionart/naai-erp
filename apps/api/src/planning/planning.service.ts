import { Inject, Injectable } from "@nestjs/common";
import { API_VERSION } from "@naai-erp/contracts";
import { MasterDataService } from "../master-data/master-data.service.js";
import {
  PLANNING_STORE,
  type PlanningContext,
  type PlanningResource,
  type PlanningStore,
} from "./planning.types.js";

const WRITE = new Set(["owner", "finance_admin", "accountant", "project_manager"]);
const PUBLISH = new Set(["owner", "finance_admin", "approver"]);

@Injectable()
export class PlanningService {
  constructor(
    @Inject(PLANNING_STORE) private readonly store: PlanningStore,
    @Inject(MasterDataService) private readonly master: MasterDataService,
  ) {}
  authenticate(auth: string | undefined, org: string, correlation: string) {
    return this.master.authenticate(auth, org, correlation);
  }
  private envelope(c: PlanningContext, data: unknown) {
    return {
      apiVersion: API_VERSION,
      requestId: c.correlationId,
      organizationId: c.organizationId,
      data,
    };
  }
  private authorize(
    c: PlanningContext,
    key: string | undefined,
    publish = false,
  ): asserts key is string {
    if (!c.roles.some((role) => (publish ? PUBLISH : WRITE).has(role)))
      throw new Error("FORBIDDEN");
    if (!key?.trim()) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
  }
  list(
    c: PlanningContext,
    resource: PlanningResource,
    filters: Record<string, string | undefined>,
  ) {
    return this.store.list(c, resource, filters).then((data) => this.envelope(c, data));
  }
  async get(c: PlanningContext, resource: PlanningResource, id: string) {
    const data = await this.store.get(c, resource, id);
    if (!data) throw new Error("RESOURCE_NOT_FOUND");
    return this.envelope(c, data);
  }
  async create(
    c: PlanningContext,
    resource: PlanningResource,
    input: Record<string, unknown>,
    key?: string,
  ) {
    this.authorize(c, key);
    if (input.schemaVersion !== 1 || !String(input.reason ?? "").trim())
      throw new Error("VALIDATION_FAILED");
    return this.envelope(c, await this.store.create(c, resource, input, key));
  }
  async transition(
    c: PlanningContext,
    resource: PlanningResource,
    id: string,
    action: string,
    input: Record<string, unknown>,
    key?: string,
  ) {
    if (!["publish", "supersede"].includes(action)) throw new Error("RESOURCE_NOT_FOUND");
    this.authorize(c, key, true);
    if (
      input.schemaVersion !== 1 ||
      !/^\d+$/.test(String(input.expectedResourceVersion)) ||
      !String(input.reason ?? "").trim()
    )
      throw new Error("VALIDATION_FAILED");
    return this.envelope(c, await this.store.transition(c, resource, id, action, input, key));
  }
}
