import { Inject, Injectable } from "@nestjs/common";
import { API_VERSION } from "@naai-erp/contracts";
import {
  buildProjectProfitability,
  profitabilityRatioBps,
  type ProjectProfitability,
} from "@naai-erp/domain";
import { MasterDataService } from "../master-data/master-data.service.js";
import {
  PROJECT_PROFITABILITY_STORE,
  type ProjectProfitabilityContext,
  type ProjectProfitabilityQuery,
  type ProjectProfitabilitySource,
  type ProjectProfitabilityStore,
} from "./project-profitability.types.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const FLAGS = new Set(["unbilled_work", "overdue_ar", "budget_overrun", "missing_dimensions"]);

@Injectable()
export class ProjectProfitabilityService {
  constructor(
    @Inject(PROJECT_PROFITABILITY_STORE) private readonly store: ProjectProfitabilityStore,
    @Inject(MasterDataService) private readonly masterData: MasterDataService,
  ) {}

  authenticate(authorization: string | undefined, organizationId: string, correlationId: string) {
    return this.masterData.authenticate(authorization, organizationId, correlationId);
  }

  parseQuery(input: Record<string, string | undefined>): ProjectProfitabilityQuery {
    const todayStr = new Date().toISOString().substring(0, 10);
    const rawAsOf = input.asOf ?? input.endsOn ?? input.asOfDate ?? todayStr;
    const asOf = ISO_DATE.test(rawAsOf) ? rawAsOf : todayStr;
    const rawStart = input.periodStart ?? input.startsOn ?? `${asOf.slice(0, 7)}-01`;
    const periodStart = ISO_DATE.test(rawStart) ? rawStart : `${asOf.slice(0, 4)}-01-01`;
    const rawEnd = input.periodEnd ?? input.endsOn ?? asOf;
    let periodEnd = ISO_DATE.test(rawEnd) ? rawEnd : asOf;
    if (periodEnd > asOf) {
      periodEnd = asOf;
    }
    if (periodStart > periodEnd) {
      throw new Error("VALIDATION_FAILED");
    }
    const confidenceFlag = input.confidenceFlag ?? input.confidenceCode;
    if (confidenceFlag && !FLAGS.has(confidenceFlag)) throw new Error("VALIDATION_FAILED");
    if (
      input.groupBy &&
      !["project", "client", "service_line", "account_owner"].includes(input.groupBy)
    )
      throw new Error("VALIDATION_FAILED");
    return {
      asOf,
      periodStart,
      periodEnd,
      ...(input.clientId ? { clientId: input.clientId } : {}),
      ...((input.serviceLineId ?? input.serviceLineCode)
        ? { serviceLineId: (input.serviceLineId ?? input.serviceLineCode)! }
        : {}),
      ...(input.accountOwnerId ? { accountOwnerId: input.accountOwnerId } : {}),
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.groupBy
        ? { groupBy: input.groupBy as NonNullable<ProjectProfitabilityQuery["groupBy"]> }
        : {}),
      ...(confidenceFlag
        ? {
            confidenceFlag: confidenceFlag as NonNullable<
              ProjectProfitabilityQuery["confidenceFlag"]
            >,
          }
        : {}),
    };
  }

  private serialize(source: ProjectProfitabilitySource, detail = false) {
    const calculated = buildProjectProfitability(source);
    const money = (value: bigint | null) => (value === null ? null : value.toString());
    const report: ProjectProfitability & Record<string, unknown> = calculated;
    const confidenceFlags = calculated.confidenceFlags.map((flag) => ({
      ...flag,
      ...(flag.amountMinor === undefined ? {} : { amountMinor: flag.amountMinor.toString() }),
    }));
    const output = {
      schemaVersion: 1,
      ...report,
      projectCode: source.projectCode,
      projectName: source.projectName,
      clientName: source.clientName,
      serviceLineId: calculated.serviceLineCode,
      serviceLineName: source.serviceLineName,
      accountOwnerName: source.accountOwnerName,
      recognizedRevenueMinor: money(calculated.recognizedRevenueMinor),
      invoicedRevenueMinor: money(calculated.invoicedRevenueMinor),
      collectedRevenueMinor: money(calculated.collectedRevenueMinor),
      directProjectCostMinor: money(calculated.directProjectCostMinor),
      directCostMinor: money(calculated.directProjectCostMinor),
      grossMarginMinor: money(calculated.grossMarginMinor),
      budgetRevenueMinor: source.budgetRevenueMinor.toString(),
      budgetCostMinor: money(calculated.budgetCostMinor),
      overrunMinor: money(calculated.overrunMinor),
      overrunAmountMinor: money(calculated.overrunMinor),
      unbilledWorkMinor: money(calculated.unbilledWorkMinor),
      overdueArMinor: money(calculated.overdueArMinor),
      confidenceFlags,
      confidenceCodes: confidenceFlags.map((flag) => flag.code),
      confidenceDetails: calculated.confidenceFlags.map((flag) => ({
        ...flag,
        ...(flag.amountMinor === undefined ? {} : { amountMinor: flag.amountMinor.toString() }),
        title: flag.code.replaceAll("_", " "),
        description: `Detected from posted or approved sources as of ${source.endsOn}.`,
      })),
      ...(detail ? source.breakdown : {}),
    };
    return output;
  }

  private totals(items: ReturnType<ProjectProfitabilityService["serialize"]>[]) {
    const amount = (field: string) =>
      items.reduce(
        (total, item) => total + BigInt(String((item as Record<string, unknown>)[field] ?? "0")),
        0n,
      );
    const recognized = amount("recognizedRevenueMinor");
    const gross = amount("grossMarginMinor");
    return {
      projectCount: items.length,
      recognizedRevenueMinor: recognized.toString(),
      invoicedRevenueMinor: amount("invoicedRevenueMinor").toString(),
      collectedRevenueMinor: amount("collectedRevenueMinor").toString(),
      directCostMinor: amount("directCostMinor").toString(),
      grossMarginMinor: gross.toString(),
      grossMarginBps: profitabilityRatioBps(gross, recognized),
      budgetCostMinor: amount("budgetCostMinor").toString(),
      overrunMinor: amount("overrunMinor").toString(),
      unbilledWorkMinor: amount("unbilledWorkMinor").toString(),
      overdueArMinor: amount("overdueArMinor").toString(),
    };
  }

  private groups(
    items: ReturnType<ProjectProfitabilityService["serialize"]>[],
    groupBy: NonNullable<ProjectProfitabilityQuery["groupBy"]>,
  ) {
    const dimensions: Record<
      NonNullable<ProjectProfitabilityQuery["groupBy"]>,
      readonly [string, string]
    > = {
      project: ["projectId", "projectName"],
      client: ["clientId", "clientName"],
      service_line: ["serviceLineCode", "serviceLineName"],
      account_owner: ["accountOwnerId", "accountOwnerName"],
    };
    const dimension = dimensions[groupBy];
    const grouped = new Map<string, ReturnType<ProjectProfitabilityService["serialize"]>[]>();
    for (const item of items) {
      const value = item as Record<string, unknown>;
      const key = String(value[dimension[0]] ?? "unclassified");
      grouped.set(key, [...(grouped.get(key) ?? []), item]);
    }
    const money = (rows: ReturnType<ProjectProfitabilityService["serialize"]>[], field: string) =>
      rows.reduce(
        (total, row) => total + BigInt(String((row as Record<string, unknown>)[field] ?? 0)),
        0n,
      );
    return [...grouped.entries()]
      .map(([key, rows]) => {
        const revenue = money(rows, "recognizedRevenueMinor");
        const direct = money(rows, "directCostMinor");
        const gross = revenue - direct;
        return {
          groupBy,
          key,
          name:
            key === "unclassified"
              ? "Unclassified"
              : String((rows[0] as Record<string, unknown>)[dimension[1]] ?? key),
          projectCount: rows.length,
          recognizedRevenueMinor: revenue.toString(),
          directCostMinor: direct.toString(),
          grossMarginMinor: gross.toString(),
          grossMarginBps: profitabilityRatioBps(gross, revenue),
        };
      })
      .sort((left, right) => left.key.localeCompare(right.key));
  }

  async list(context: ProjectProfitabilityContext, query: ProjectProfitabilityQuery) {
    let items = (await this.store.list(context.organizationId, query)).map((item) =>
      this.serialize(item),
    );
    if (query.confidenceFlag)
      items = items.filter((item) => item.confidenceCodes.includes(query.confidenceFlag!));
    return {
      apiVersion: API_VERSION,
      requestId: context.correlationId,
      organizationId: context.organizationId,
      data: {
        asOf: query.asOf,
        periodStart: query.periodStart,
        periodEnd: query.periodEnd,
        currency: items[0]?.currency ?? null,
        items,
        groupBy: query.groupBy ?? "project",
        groups: this.groups(items, query.groupBy ?? "project"),
        totals: this.totals(items),
      },
    };
  }

  async get(
    context: ProjectProfitabilityContext,
    projectId: string,
    query: ProjectProfitabilityQuery,
  ) {
    const item = await this.store.get(context.organizationId, projectId, query);
    if (!item) throw new Error("RESOURCE_NOT_FOUND");
    return {
      apiVersion: API_VERSION,
      requestId: context.correlationId,
      organizationId: context.organizationId,
      data: this.serialize(item, true),
    };
  }
}
