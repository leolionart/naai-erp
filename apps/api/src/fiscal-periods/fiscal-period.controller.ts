import { Body, Controller, Headers, Inject, Param, Post } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { FiscalPeriodService } from "./fiscal-period.service.js";
import type { PeriodCommandInput } from "./pg-fiscal-period.store.js";

@Controller("api/v1/organizations/:organizationId/fiscal-periods")
export class FiscalPeriodController {
  constructor(@Inject(FiscalPeriodService) private readonly service: FiscalPeriodService) {}

  @Post(":action")
  async transition(
    @Param("organizationId") organizationId: string,
    @Param("action") action: string,
    @Body() input: PeriodCommandInput,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    if (action !== "close" && action !== "reopen") throw new Error("RESOURCE_NOT_FOUND");
    const context = await this.service.authenticate(
      authorization,
      organizationId,
      correlationId ?? randomUUID(),
    );
    return this.service.transition(action, context, input, idempotencyKey);
  }
}
