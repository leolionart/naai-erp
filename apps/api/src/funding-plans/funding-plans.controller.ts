import { Body, Controller, Get, Headers, Inject, Param, Post, Query } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { FundingPlansService } from "./funding-plans.service.js";
import type { FundingPlanCommitRequest, FundingPlanDryRunRequest } from "./funding-plans.types.js";

@Controller("api/v1/organizations/:organizationId/funding-plans")
export class FundingPlansController {
  constructor(@Inject(FundingPlansService) private readonly service: FundingPlansService) {}

  private context(organizationId: string, authorization?: string, correlationId?: string) {
    return this.service.authenticate(authorization, organizationId, correlationId ?? randomUUID());
  }

  @Get("export")
  async exportPlan(
    @Param("organizationId") organizationId: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("format") format?: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.service.exportPlan(
      await this.context(organizationId, authorization, correlationId),
      { ...(from ? { from } : {}), ...(to ? { to } : {}), ...(format ? { format } : {}) },
    );
  }

  @Get("unlinked")
  async listUnlinked(
    @Param("organizationId") organizationId: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.service.listUnlinked(
      await this.context(organizationId, authorization, correlationId),
    );
  }

  @Post("dry-run")
  async dryRun(
    @Param("organizationId") organizationId: string,
    @Body() body: FundingPlanDryRunRequest,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.service.dryRun(
      await this.context(organizationId, authorization, correlationId),
      body ?? { items: [] },
    );
  }

  @Post("commit")
  async commit(
    @Param("organizationId") organizationId: string,
    @Body() body: FundingPlanCommitRequest,
    @Headers("authorization") authorization?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.service.commit(
      await this.context(organizationId, authorization, correlationId),
      body ?? { planHash: "", items: [] },
      idempotencyKey,
    );
  }
}
