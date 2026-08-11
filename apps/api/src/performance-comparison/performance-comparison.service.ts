import { Inject, Injectable } from "@nestjs/common";
import { API_VERSION } from "@naai-erp/contracts";
import { MasterDataService } from "../master-data/master-data.service.js";
import {
  PERFORMANCE_STORE,
  type ActualFactQuery,
  type ActualFactSummaryQuery,
  type PerformanceContext,
  type PerformanceQuery,
  type PerformanceStore,
} from "./performance-comparison.types.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isIsoDate = (value: string) =>
  ISO_DATE.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const BASIS = new Set(["recognized", "invoiced", "collected"]);

@Injectable()
export class PerformanceComparisonService {
  constructor(
    @Inject(PERFORMANCE_STORE) private readonly store: PerformanceStore,
    @Inject(MasterDataService) private readonly master: MasterDataService,
  ) {}
  authenticate(auth: string | undefined, org: string, correlation: string) {
    return this.master.authenticate(auth, org, correlation);
  }
  private envelope(c: PerformanceContext, data: unknown) {
    return {
      apiVersion: API_VERSION,
      requestId: c.correlationId,
      organizationId: c.organizationId,
      data,
    };
  }
  parseQuery(input: Record<string, string | undefined>): PerformanceQuery {
    const actualBasis = input.actualBasis ?? input.basis ?? "invoiced";
    let asOfInstant = input.asOfInstant ?? input.asOf ?? new Date().toISOString().substring(0, 10);
    if (!asOfInstant.includes("T")) {
      asOfInstant = `${asOfInstant}T16:59:59.999Z`;
    }
    const periodBasis =
      input.periodBasis ?? (input.periodId?.startsWith("FY") ? "fiscal" : "calendar");
    const periodId = input.periodId ?? `CAL-${new Date().toISOString().substring(0, 7)}`;
    if (
      !["calendar", "fiscal"].includes(periodBasis) ||
      !BASIS.has(actualBasis) ||
      Number.isNaN(Date.parse(asOfInstant))
    )
      throw new Error("VALIDATION_FAILED");
    const dimensions = Object.fromEntries(
      Object.entries({
        teamId: input.teamId,
        serviceLineCode: input.serviceLineCode,
        ownerId: input.ownerId,
      }).filter((x): x is [string, string] => Boolean(x[1])),
    );
    return {
      periodId,
      periodBasis: periodBasis as PerformanceQuery["periodBasis"],
      actualBasis: actualBasis as PerformanceQuery["actualBasis"],
      asOfInstant,
      ...(input.forecastVersionId ? { forecastVersionId: input.forecastVersionId } : {}),
      dimensions,
    };
  }
  parseFacts(input: Record<string, string | undefined>): ActualFactQuery {
    if (input.actualBasis && !BASIS.has(input.actualBasis)) throw new Error("VALIDATION_FAILED");
    if (
      (input.from && !isIsoDate(input.from)) ||
      (input.to && !isIsoDate(input.to)) ||
      (input.from && input.to && input.from > input.to)
    )
      throw new Error("VALIDATION_FAILED");
    return {
      ...(input.actualBasis
        ? { actualBasis: input.actualBasis as NonNullable<ActualFactQuery["actualBasis"]> }
        : {}),
      ...(input.from ? { from: input.from } : {}),
      ...(input.to ? { to: input.to } : {}),
      ...(input.cursor ? { cursor: input.cursor } : {}),
      limit: Math.min(100, Math.max(1, Number(input.limit ?? 50) || 50)),
    };
  }
  parseFactSummary(input: Record<string, string | undefined>): ActualFactSummaryQuery {
    const actualBasis = input.actualBasis ?? input.basis;
    if (
      !actualBasis ||
      !BASIS.has(actualBasis) ||
      !input.from ||
      !isIsoDate(input.from) ||
      !input.to ||
      !isIsoDate(input.to) ||
      input.from > input.to
    )
      throw new Error("VALIDATION_FAILED");
    return {
      actualBasis: actualBasis as ActualFactSummaryQuery["actualBasis"],
      from: input.from,
      to: input.to,
      dimensions: Object.fromEntries(
        Object.entries({
          teamId: input.teamId,
          serviceLineCode: input.serviceLineCode,
          ownerId: input.ownerId,
        }).filter((entry): entry is [string, string] => Boolean(entry[1])),
      ),
    };
  }
  report(c: PerformanceContext, q: PerformanceQuery) {
    return this.store.report(c, q).then((data) => this.envelope(c, data));
  }
  listFacts(c: PerformanceContext, q: ActualFactQuery) {
    return this.store.listFacts(c, q).then((data) => this.envelope(c, data));
  }
  summarizeFacts(c: PerformanceContext, q: ActualFactSummaryQuery) {
    return this.store.summarizeFacts(c, q).then((data) => this.envelope(c, data));
  }
}
