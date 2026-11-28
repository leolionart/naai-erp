import { Controller, Get, Headers, Inject, Param, Query } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { ReconciliationService } from "./reconciliation.service.js";

@Controller("api/v1/organizations/:organizationId/banking/reconciliations")
export class ReconciliationController {
  constructor(@Inject(ReconciliationService) private readonly service: ReconciliationService) {}
  private context(org: string, auth?: string, corr?: string) {
    return this.service.authenticate(auth, org, corr ?? randomUUID());
  }
  @Get() async list(
    @Param("organizationId") org: string,
    @Query("state") state?: string,
    @Query("financialAccountId") financialAccountId?: string,
    @Query() query?: Record<string, string | undefined>,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") corr?: string,
  ) {
    return this.service.list(
      await this.context(org, auth, corr),
      {
        ...(state ? { state } : {}),
        ...(financialAccountId ? { financialAccountId } : {}),
      },
      query,
    );
  }
  @Get(":id") async get(
    @Param("organizationId") org: string,
    @Param("id") id: string,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") corr?: string,
  ) {
    return this.service.get(await this.context(org, auth, corr), id);
  }
}
