import { Controller, Get, Headers, Inject, Param, Query } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { ExpenseReportService } from "./expense-report.service.js";

@Controller("api/v1/organizations/:organizationId/reports/expenses")
export class ExpenseReportController {
  constructor(@Inject(ExpenseReportService) private readonly service: ExpenseReportService) {}
  private async run(
    dimension: "payee" | "category",
    organizationId: string,
    startsOn: string,
    endsOn: string,
    authorization?: string,
    correlationId?: string,
  ) {
    const context = await this.service.authenticate(
      authorization,
      organizationId,
      correlationId ?? randomUUID(),
    );
    return this.service.report(context, { startsOn, endsOn }, dimension);
  }
  @Get("by-payee") byPayee(
    @Param("organizationId") organizationId: string,
    @Query("startsOn") startsOn: string,
    @Query("endsOn") endsOn: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.run("payee", organizationId, startsOn, endsOn, authorization, correlationId);
  }
  @Get("by-category") byCategory(
    @Param("organizationId") organizationId: string,
    @Query("startsOn") startsOn: string,
    @Query("endsOn") endsOn: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.run("category", organizationId, startsOn, endsOn, authorization, correlationId);
  }
}
