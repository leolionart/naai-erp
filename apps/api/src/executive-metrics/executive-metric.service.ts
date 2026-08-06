import { Inject, Injectable } from "@nestjs/common";
import { API_VERSION } from "@naai-erp/contracts";
import { MasterDataService } from "../master-data/master-data.service.js";
import {
  EXECUTIVE_METRIC_STORE,
  type ExecutiveMetricContext,
  type ExecutiveMetricQuery,
  type ExecutiveMetricStore,
  type PolicyInput,
  type RoiDefinitionInput,
  type RoiFactInput,
} from "./executive-metric.types.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const WRITE = new Set(["owner", "finance_admin", "accountant", "integration"]);
const APPROVE = new Set(["owner", "finance_admin", "accountant", "approver"]);
@Injectable()
export class ExecutiveMetricService {
  constructor(
    @Inject(EXECUTIVE_METRIC_STORE) private readonly store: ExecutiveMetricStore,
    @Inject(MasterDataService) private readonly master: MasterDataService,
  ) {}
  authenticate(a: string | undefined, o: string, c: string) {
    return this.master.authenticate(a, o, c);
  }
  private envelope(c: ExecutiveMetricContext, data: unknown) {
    return {
      apiVersion: API_VERSION,
      requestId: c.correlationId,
      organizationId: c.organizationId,
      data,
    };
  }
  private write(c: ExecutiveMetricContext, key?: string) {
    if (!c.roles.some((r) => WRITE.has(r))) throw new Error("FORBIDDEN");
    if (!key) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
  }
  private approve(c: ExecutiveMetricContext, key?: string) {
    if (!c.roles.some((r) => APPROVE.has(r))) throw new Error("FORBIDDEN");
    if (!key) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
  }
  parseQuery(i: Record<string, string | undefined>): ExecutiveMetricQuery {
    const startsOn = i.startsOn ?? i.from,
      endsOn = i.endsOn ?? i.to,
      asOfInstant = i.asOfInstant ?? i.asOf,
      framework = i.framework ?? "TT133";
    if (
      !startsOn ||
      !endsOn ||
      !DATE.test(startsOn) ||
      !DATE.test(endsOn) ||
      startsOn > endsOn ||
      !asOfInstant ||
      Number.isNaN(Date.parse(asOfInstant)) ||
      !asOfInstant.includes("T") ||
      !["TT133", "TT200"].includes(framework)
    )
      throw new Error("VALIDATION_FAILED");
    return {
      startsOn,
      endsOn,
      asOfInstant,
      framework: framework as "TT133" | "TT200",
      dimensions: Object.fromEntries(
        Object.entries({
          cost_center: i.costCenter ?? i.costCenterId,
          service_line: i.serviceLine ?? i.serviceLineCode,
          project: i.projectId,
          client: i.clientId,
          team: i.teamId,
          owner: i.ownerId,
        }).filter((x): x is [string, string] => Boolean(x[1])),
      ),
    };
  }
  parsePolicy(i: Record<string, unknown>): PolicyInput {
    const p = i.formulaPolicy as Record<string, unknown>,
      m = Array.isArray(i.mappings) ? i.mappings : [];
    if (
      !DATE.test(String(i.effectiveFrom)) ||
      !String(i.formulaVersion ?? "").trim() ||
      !String(i.changeReason ?? "").trim() ||
      !p ||
      !Number.isInteger(p.averageBurnMonths) ||
      Number(p.averageBurnMonths) < 1 ||
      p.equityConsumedDenominator !== "contributed_capital" ||
      p.runwayCashSemantic !== "unrestricted_cash" ||
      p.runwayFlowClass !== "operating" ||
      typeof p.signedRevenueDenominator !== "boolean" ||
      !m.length
    )
      throw new Error("VALIDATION_FAILED");
    return i as PolicyInput;
  }
  parseDefinition(i: Record<string, unknown>): RoiDefinitionInput {
    const p = i.includedCostPolicy as Record<string, unknown>;
    if (
      !["project", "marketing", "custom"].includes(String(i.purpose)) ||
      !String(i.name ?? "").trim() ||
      !DATE.test(String(i.effectiveFrom)) ||
      !String(i.formulaVersion ?? "").trim() ||
      !String(i.changeReason ?? "").trim() ||
      !p ||
      !Array.isArray(p.includedKinds) ||
      !Array.isArray(p.excludedKinds)
    )
      throw new Error("VALIDATION_FAILED");
    return i as RoiDefinitionInput;
  }
  parseFact(i: Record<string, unknown>): RoiFactInput {
    try {
      if (
        !String(i.definitionId ?? "").trim() ||
        !Number.isInteger(i.definitionVersion) ||
        !["benefit", "included_cost"].includes(String(i.kind)) ||
        !DATE.test(String(i.periodStartsOn)) ||
        !DATE.test(String(i.periodEndsOn)) ||
        String(i.periodStartsOn) > String(i.periodEndsOn) ||
        BigInt(String(i.amountMinor)) < 0n ||
        !/^[A-Za-z]{3}$/.test(String(i.currency)) ||
        !String(i.sourceType ?? "").trim() ||
        !String(i.sourceId ?? "").trim()
      )
        throw new Error();
    } catch {
      throw new Error("VALIDATION_FAILED");
    }
    return i as RoiFactInput;
  }
  listPolicies(c: ExecutiveMetricContext) {
    return this.store.listPolicies(c).then((x) => this.envelope(c, x));
  }
  getPolicy(c: ExecutiveMetricContext, id: string, v?: number) {
    return this.store.getPolicy(c, id, v).then((x) => this.envelope(c, x));
  }
  async createPolicy(c: ExecutiveMetricContext, i: PolicyInput, k?: string) {
    this.write(c, k);
    return this.envelope(c, await this.store.createPolicy(c, i, k!));
  }
  async approvePolicy(c: ExecutiveMetricContext, id: string, v: number, r: string, k?: string) {
    this.approve(c, k);
    if (!Number.isInteger(v) || v < 1 || !r.trim()) throw new Error("VALIDATION_FAILED");
    return this.envelope(c, await this.store.approvePolicy(c, id, v, r, k!));
  }
  listDefinitions(c: ExecutiveMetricContext) {
    return this.store.listDefinitions(c).then((x) => this.envelope(c, x));
  }
  getDefinition(c: ExecutiveMetricContext, id: string, v?: number) {
    return this.store.getDefinition(c, id, v).then((x) => this.envelope(c, x));
  }
  async createDefinition(c: ExecutiveMetricContext, i: RoiDefinitionInput, k?: string) {
    this.write(c, k);
    return this.envelope(c, await this.store.createDefinition(c, i, k!));
  }
  async approveDefinition(c: ExecutiveMetricContext, id: string, v: number, r: string, k?: string) {
    this.approve(c, k);
    if (!Number.isInteger(v) || v < 1 || !r.trim()) throw new Error("VALIDATION_FAILED");
    return this.envelope(c, await this.store.approveDefinition(c, id, v, r, k!));
  }
  listFacts(c: ExecutiveMetricContext, d?: string, s?: string) {
    if (s && !["pending", "reviewed", "rejected"].includes(s)) throw new Error("VALIDATION_FAILED");
    return this.store.listFacts(c, d, s).then((x) => this.envelope(c, x));
  }
  async createFact(c: ExecutiveMetricContext, i: RoiFactInput, k?: string) {
    this.write(c, k);
    return this.envelope(c, await this.store.createFact(c, i, k!));
  }
  async reviewFact(
    c: ExecutiveMetricContext,
    id: string,
    s: "reviewed" | "rejected",
    r: string,
    k?: string,
  ) {
    this.approve(c, k);
    if (!["reviewed", "rejected"].includes(s) || !r.trim()) throw new Error("VALIDATION_FAILED");
    return this.envelope(c, await this.store.reviewFact(c, id, s, r, k!));
  }
  report(c: ExecutiveMetricContext, q: ExecutiveMetricQuery) {
    return this.store.report(c, q).then((x) => this.envelope(c, x));
  }
}
