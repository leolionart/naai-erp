import { Inject, Injectable } from "@nestjs/common";
import { API_VERSION } from "@naai-erp/contracts";
import { MasterDataService } from "../master-data/master-data.service.js";
import {
  PROJECT_RECOGNITION_STORE,
  type ProjectRecognitionContext,
  type ProjectRecognitionStore,
  type RecognitionResource,
} from "./project-recognition.types.js";

const WRITE = new Set(["owner", "finance_admin", "accountant", "project_manager"]);
const APPROVE = new Set(["owner", "finance_admin", "approver"]);
const ACTIONS: Record<RecognitionResource, readonly string[]> = {
  "scope-changes": ["submit", "approve", "reject"],
  "project-budgets": ["submit", "approve", "reject"],
  "recognition-policies": ["submit", "approve", "reject"],
  "milestone-acceptances": ["submit", "accept", "reject"],
  "revenue-recognition-events": ["submit", "approve", "reject", "post", "reverse"],
};

@Injectable()
export class ProjectRecognitionService {
  constructor(
    @Inject(PROJECT_RECOGNITION_STORE) private readonly store: ProjectRecognitionStore,
    @Inject(MasterDataService) private readonly master: MasterDataService,
  ) {}
  authenticate(a: string | undefined, o: string, correlationId: string) {
    return this.master.authenticate(a, o, correlationId);
  }
  private envelope(c: ProjectRecognitionContext, data: unknown) {
    return {
      apiVersion: API_VERSION,
      requestId: c.correlationId,
      organizationId: c.organizationId,
      data,
    };
  }
  private write(
    c: ProjectRecognitionContext,
    key?: string,
    approval = false,
  ): asserts key is string {
    if (!c.roles.some((role) => (approval ? APPROVE : WRITE).has(role)))
      throw new Error("FORBIDDEN");
    if (!key?.trim()) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
  }
  list(
    c: ProjectRecognitionContext,
    resource: RecognitionResource,
    projectId?: string,
    state?: string,
  ) {
    return this.store.list(c, resource, projectId, state).then((x) => this.envelope(c, x));
  }
  async get(c: ProjectRecognitionContext, resource: RecognitionResource, id: string) {
    const x = await this.store.get(c, resource, id);
    if (!x) throw new Error("RESOURCE_NOT_FOUND");
    return this.envelope(c, x);
  }
  async create(
    c: ProjectRecognitionContext,
    resource: RecognitionResource,
    input: Record<string, unknown>,
    key?: string,
  ) {
    this.write(c, key);
    if (input.schemaVersion !== 1 || !String(input.reason ?? "").trim())
      throw new Error("VALIDATION_FAILED");
    return this.envelope(c, await this.store.create(c, resource, input, key));
  }
  async transition(
    c: ProjectRecognitionContext,
    resource: RecognitionResource,
    id: string,
    action: string,
    input: Record<string, unknown>,
    key?: string,
  ) {
    if (!ACTIONS[resource].includes(action)) throw new Error("RESOURCE_NOT_FOUND");
    this.write(c, key, ["approve", "accept", "reject", "post", "reverse"].includes(action));
    if (
      input.schemaVersion !== 1 ||
      !/^\d+$/.test(String(input.expectedResourceVersion)) ||
      !String(input.reason ?? "").trim()
    )
      throw new Error("VALIDATION_FAILED");
    return this.envelope(c, await this.store.transition(c, resource, id, action, input, key));
  }
  position(c: ProjectRecognitionContext, projectId: string, asOf?: string) {
    return this.store.revenuePosition(c, projectId, asOf).then((x) => this.envelope(c, x));
  }
}
