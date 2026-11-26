import { Body, Controller, Get, Headers, Inject, Param, Put, Query } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { CitPolicyService } from "./cit-policy.service.js";

@Controller("api/v1/organizations/:organizationId")
export class CitPolicyController {
  constructor(@Inject(CitPolicyService) private readonly service: CitPolicyService) {}

  private context(organizationId: string, authorization?: string, correlationId?: string) {
    return this.service.authenticate(authorization, organizationId, correlationId ?? randomUUID());
  }

  @Get("cit-policy")
  async getPolicy(
    @Param("organizationId") organizationId: string,
    @Query("year") year?: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.service.getPolicy(
      await this.context(organizationId, authorization, correlationId),
      year,
    );
  }

  @Put("cit-policy")
  async upsertPolicy(
    @Param("organizationId") organizationId: string,
    @Body() body: Record<string, unknown>,
    @Headers("authorization") authorization?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
    @Headers("if-match") ifMatch?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.service.upsertPolicy(
      await this.context(organizationId, authorization, correlationId),
      body,
      idempotencyKey,
      ifMatch,
    );
  }

  @Put("cit-policy/rate-tiers/:effectiveFromYear")
  async upsertRateTiers(
    @Param("organizationId") organizationId: string,
    @Param("effectiveFromYear") effectiveFromYear: string,
    @Body() body: Record<string, unknown>,
    @Headers("authorization") authorization?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.service.upsertRateTiers(
      await this.context(organizationId, authorization, correlationId),
      effectiveFromYear,
      body,
      idempotencyKey,
    );
  }

  @Get("reports/tax/estimated-cit")
  async estimatedCitReport(
    @Param("organizationId") organizationId: string,
    @Query() query: Record<string, string | undefined>,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.service.estimateReport(
      await this.context(organizationId, authorization, correlationId),
      query,
    );
  }
}
