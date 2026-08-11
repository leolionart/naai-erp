import { Controller, Get, Headers, Inject, Param, Query } from "@nestjs/common";
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
  @Get("planning-actual-facts/summary") async factSummary(
    @Param("organizationId") org: string,
    @Query() query: Record<string, string | undefined>,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") correlation?: string,
  ) {
    return this.service.summarizeFacts(
      await this.context(org, auth, correlation),
      this.service.parseFactSummary(query),
    );
  }
}
