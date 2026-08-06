import { Body, Controller, Get, Headers, Inject, Param, Post, Query } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PerformanceComparisonService } from "./performance-comparison.service.js";

@Controller("api/v1/organizations/:organizationId")
export class PerformanceComparisonController {
  constructor(
    @Inject(PerformanceComparisonService) private readonly service: PerformanceComparisonService,
  ) {}
  private context(org: string, auth?: string, correlation?: string) {
    return this.service.authenticate(auth, org, correlation ?? randomUUID());
  }
  @Get("reports/performance-comparisons") async report(
    @Param("organizationId") org: string,
    @Query() query: Record<string, string | undefined>,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") correlation?: string,
  ) {
    return this.service.report(
      await this.context(org, auth, correlation),
      this.service.parseQuery(query),
    );
  }
  @Get("planning-actual-facts") async facts(
    @Param("organizationId") org: string,
    @Query() query: Record<string, string | undefined>,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") correlation?: string,
  ) {
    return this.service.listFacts(
      await this.context(org, auth, correlation),
      this.service.parseFacts(query),
    );
  }
  @Post("planning-actual-facts/backfill") async backfill(
    @Param("organizationId") org: string,
    @Body() input: Record<string, unknown>,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") correlation?: string,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.backfill(await this.context(org, auth, correlation), input, key);
  }
}
