import { Body, Controller, Get, Headers, Inject, Param, Post } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { BankingControlService } from "./banking-control.service.js";
import type {
  CloseStatementSessionInput,
  CreateControlExceptionInput,
  CreateStatementSessionInput,
  ReviewControlExceptionInput,
} from "./banking-control.types.js";
@Controller("api/v1/organizations/:organizationId/banking/statement-sessions")
export class BankingControlController {
  constructor(@Inject(BankingControlService) private readonly service: BankingControlService) {}
  private c(o: string, a?: string, c?: string) {
    return this.service.authenticate(a, o, c ?? randomUUID());
  }
  @Get() async list(
    @Param("organizationId") o: string,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
  ) {
    return this.service.list(await this.c(o, a, c));
  }
  @Post() async create(
    @Param("organizationId") o: string,
    @Body() i: CreateStatementSessionInput,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
    @Headers("idempotency-key") k?: string,
  ) {
    return this.service.create(await this.c(o, a, c), i, k);
  }
  @Get(":id") async get(
    @Param("organizationId") o: string,
    @Param("id") id: string,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
  ) {
    return this.service.get(await this.c(o, a, c), id);
  }
  @Post(":id/close") async close(
    @Param("organizationId") o: string,
    @Param("id") id: string,
    @Body() i: CloseStatementSessionInput,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
    @Headers("idempotency-key") k?: string,
  ) {
    return this.service.close(await this.c(o, a, c), id, i, k);
  }
  @Post(":id/review") async reviewSession(
    @Param("organizationId") o: string,
    @Param("id") id: string,
    @Body() i: CloseStatementSessionInput,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
    @Headers("idempotency-key") k?: string,
  ) {
    return this.service.reviewSession(await this.c(o, a, c), id, i, k);
  }
  @Post(":id/exceptions") async exception(
    @Param("organizationId") o: string,
    @Param("id") id: string,
    @Body() i: CreateControlExceptionInput,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
    @Headers("idempotency-key") k?: string,
  ) {
    return this.service.createException(await this.c(o, a, c), id, i, k);
  }
  @Post(":id/exceptions/:exceptionId/:action") async review(
    @Param("organizationId") o: string,
    @Param("id") id: string,
    @Param("exceptionId") e: string,
    @Param("action") action: string,
    @Body() i: ReviewControlExceptionInput,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
    @Headers("idempotency-key") k?: string,
  ) {
    if (!["approve", "resolve", "reject"].includes(action)) throw new Error("RESOURCE_NOT_FOUND");
    return this.service.reviewException(
      await this.c(o, a, c),
      id,
      e,
      action as "approve" | "resolve" | "reject",
      i,
      k,
    );
  }
}
