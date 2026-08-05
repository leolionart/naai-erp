import { Body, Controller, Get, Headers, Inject, Param, Post, Query } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { WorkforceService } from "./workforce.service.js";

@Controller("api/v1/organizations/:organizationId/time")
export class WorkforceController {
  constructor(@Inject(WorkforceService) private readonly service: WorkforceService) {}
  private c(o: string, a?: string, correlation?: string) {
    return this.service.authenticate(a, o, correlation ?? randomUUID());
  }
  @Get("workers") async workers(
    @Param("organizationId") o: string,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
  ) {
    return this.service.listWorkers(await this.c(o, a, c));
  }
  @Post("workers") async createWorker(
    @Param("organizationId") o: string,
    @Body() i: Record<string, unknown>,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
    @Headers("idempotency-key") k?: string,
  ) {
    return this.service.createWorker(await this.c(o, a, c), i, k);
  }
  @Get("timesheets") async timesheets(
    @Param("organizationId") o: string,
    @Query() q: Record<string, string | undefined>,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
  ) {
    return this.service.listTimesheets(await this.c(o, a, c), q);
  }
  @Post("timesheets") async createTimesheet(
    @Param("organizationId") o: string,
    @Body() i: Record<string, unknown>,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
    @Headers("idempotency-key") k?: string,
  ) {
    return this.service.createTimesheet(await this.c(o, a, c), i, k);
  }
  @Get("timesheets/:id") async timesheet(
    @Param("organizationId") o: string,
    @Param("id") id: string,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
  ) {
    return this.service.getTimesheet(await this.c(o, a, c), id);
  }
  @Post("timesheets/:id/:action") async transition(
    @Param("organizationId") o: string,
    @Param("id") id: string,
    @Param("action") action: string,
    @Body() i: Record<string, unknown>,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
    @Headers("idempotency-key") k?: string,
  ) {
    return this.service.transition(await this.c(o, a, c), id, action, i, k);
  }
  @Post("timesheets/:id/adjustments") async adjustment(
    @Param("organizationId") o: string,
    @Param("id") id: string,
    @Body() i: Record<string, unknown>,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
    @Headers("idempotency-key") k?: string,
  ) {
    return this.service.adjustment(await this.c(o, a, c), id, i, k);
  }
  @Post("timesheets/:id/adjustments/:adjustmentId/:action") async reviewAdjustment(
    @Param("organizationId") o: string,
    @Param("id") id: string,
    @Param("adjustmentId") aid: string,
    @Param("action") action: string,
    @Body() i: Record<string, unknown>,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
    @Headers("idempotency-key") k?: string,
  ) {
    return this.service.reviewAdjustment(await this.c(o, a, c), id, aid, action, i, k);
  }
  @Get("cost-rates") async rates(
    @Param("organizationId") o: string,
    @Query("workerId") workerId?: string,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
  ) {
    return this.service.listRates(await this.c(o, a, c), workerId);
  }
  @Post("cost-rates") async createRate(
    @Param("organizationId") o: string,
    @Body() i: Record<string, unknown>,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
    @Headers("idempotency-key") k?: string,
  ) {
    return this.service.createRate(await this.c(o, a, c), i, k);
  }
  @Post("cost-rates/:id/:action") async rateAction(
    @Param("organizationId") o: string,
    @Param("id") id: string,
    @Param("action") action: string,
    @Body() i: Record<string, unknown>,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
    @Headers("idempotency-key") k?: string,
  ) {
    return this.service.reviewRate(await this.c(o, a, c), id, action, i, k);
  }
  @Get("capacity-versions") async capacity(
    @Param("organizationId") o: string,
    @Query("workerId") workerId?: string,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
  ) {
    return this.service.listCapacity(await this.c(o, a, c), workerId);
  }
  @Post("capacity-versions") async createCapacity(
    @Param("organizationId") o: string,
    @Body() i: Record<string, unknown>,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
    @Headers("idempotency-key") k?: string,
  ) {
    return this.service.createCapacity(await this.c(o, a, c), i, k);
  }
  @Get("capacity-summary") async summary(
    @Param("organizationId") o: string,
    @Query() q: Record<string, string | undefined>,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
  ) {
    return this.service.summary(await this.c(o, a, c), q);
  }
}
