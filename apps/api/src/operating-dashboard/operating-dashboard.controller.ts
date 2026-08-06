import { Controller, Get, Headers, Inject, Param, Query } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { OperatingDashboardService } from "./operating-dashboard.service.js";

@Controller("api/v1/organizations/:organizationId/reports")
export class OperatingDashboardController {
  constructor(
    @Inject(OperatingDashboardService) private readonly service: OperatingDashboardService,
  ) {}

  @Get("operating-dashboard")
  async read(
    @Param("organizationId") organizationId: string,
    @Query() values: Record<string, string | undefined>,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    const context = await this.service.authenticate(
      authorization,
      organizationId,
      correlationId ?? randomUUID(),
    );
    return this.service.read(context, this.service.parseQuery(values));
  }
}
