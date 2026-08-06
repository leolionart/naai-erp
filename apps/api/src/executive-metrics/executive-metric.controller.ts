import { Body, Controller, Get, Headers, Inject, Param, Post, Query } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { ExecutiveMetricService } from "./executive-metric.service.js";
@Controller("api/v1/organizations/:organizationId")
export class ExecutiveMetricController {
  constructor(@Inject(ExecutiveMetricService) private readonly s: ExecutiveMetricService) {}
  private c(o: string, a?: string, c?: string) {
    return this.s.authenticate(a, o, c ?? randomUUID());
  }
  @Get("executive-metric-policies") async lp(
    @Param("organizationId") o: string,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
  ) {
    return this.s.listPolicies(await this.c(o, a, c));
  }
  @Get("executive-metric-policies/:id") async gp(
    @Param("organizationId") o: string,
    @Param("id") id: string,
    @Query("version") v?: string,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
  ) {
    return this.s.getPolicy(await this.c(o, a, c), id, v ? Number(v) : undefined);
  }
  @Post("executive-metric-policies") async cp(
    @Param("organizationId") o: string,
    @Body() b: Record<string, unknown>,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
    @Headers("idempotency-key") k?: string,
  ) {
    return this.s.createPolicy(await this.c(o, a, c), this.s.parsePolicy(b), k);
  }
  @Post("executive-metric-policies/:id/versions/:version/approve") async ap(
    @Param("organizationId") o: string,
    @Param("id") id: string,
    @Param("version") v: string,
    @Body() b: { reason?: string },
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
    @Headers("idempotency-key") k?: string,
  ) {
    return this.s.approvePolicy(await this.c(o, a, c), id, Number(v), b.reason ?? "", k);
  }
  @Get("roi-definitions") async ld(
    @Param("organizationId") o: string,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
  ) {
    return this.s.listDefinitions(await this.c(o, a, c));
  }
  @Get("roi-definitions/:id") async gd(
    @Param("organizationId") o: string,
    @Param("id") id: string,
    @Query("version") v?: string,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
  ) {
    return this.s.getDefinition(await this.c(o, a, c), id, v ? Number(v) : undefined);
  }
  @Post("roi-definitions") async cd(
    @Param("organizationId") o: string,
    @Body() b: Record<string, unknown>,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
    @Headers("idempotency-key") k?: string,
  ) {
    return this.s.createDefinition(await this.c(o, a, c), this.s.parseDefinition(b), k);
  }
  @Post("roi-definitions/:id/versions/:version/approve") async ad(
    @Param("organizationId") o: string,
    @Param("id") id: string,
    @Param("version") v: string,
    @Body() b: { reason?: string },
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
    @Headers("idempotency-key") k?: string,
  ) {
    return this.s.approveDefinition(await this.c(o, a, c), id, Number(v), b.reason ?? "", k);
  }
  @Get("roi-input-facts") async lf(
    @Param("organizationId") o: string,
    @Query("definitionId") d?: string,
    @Query("reviewState") s?: string,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
  ) {
    return this.s.listFacts(await this.c(o, a, c), d, s);
  }
  @Post("roi-input-facts") async cf(
    @Param("organizationId") o: string,
    @Body() b: Record<string, unknown>,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
    @Headers("idempotency-key") k?: string,
  ) {
    return this.s.createFact(await this.c(o, a, c), this.s.parseFact(b), k);
  }
  @Post("roi-input-facts/:id/review") async rf(
    @Param("organizationId") o: string,
    @Param("id") id: string,
    @Body() b: { state?: "reviewed" | "rejected"; reason?: string },
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
    @Headers("idempotency-key") k?: string,
  ) {
    return this.s.reviewFact(await this.c(o, a, c), id, b.state!, b.reason ?? "", k);
  }
  @Get("reports/executive-metrics") async report(
    @Param("organizationId") o: string,
    @Query() q: Record<string, string | undefined>,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
  ) {
    return this.s.report(await this.c(o, a, c), this.s.parseQuery(q));
  }
  @Get("reports/executive-metrics/:projection") async projection(
    @Param("organizationId") o: string,
    @Param("projection") p: string,
    @Query() q: Record<string, string | undefined>,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
  ) {
    if (!["equity", "liquidity", "profitability", "returns", "roi"].includes(p))
      throw new Error("RESOURCE_NOT_FOUND");
    const e = await this.s.report(await this.c(o, a, c), this.s.parseQuery(q));
    const d = (e as { data: Record<string, unknown> }).data;
    const fields: Record<string, string[]> = {
      equity: [
        "accumulatedLossMinor",
        "contributedCapitalMinor",
        "ownerLoansMinor",
        "equityConsumed",
        "equityRollForward",
      ],
      liquidity: [
        "averageOperatingNetCashFlowMinor",
        "netBurnMinor",
        "unrestrictedCashMinor",
        "restrictedCashMinor",
        "runwayMonthsThousandths",
        "runwayStatus",
      ],
      profitability: ["grossMargin", "operatingMargin", "netMargin", "ros"],
      returns: ["roe", "roa"],
      roi: ["roi"],
    };
    return { ...e, data: Object.fromEntries(fields[p]!.map((k) => [k, d[k]])) };
  }
}
