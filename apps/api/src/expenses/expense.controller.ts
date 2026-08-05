import { Body, Controller, Get, Headers, Inject, Param, Post, Query } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { ExpenseService } from "./expense.service.js";
import type { CreateExpenseInput, ExpenseReviewInput } from "./expense.types.js";

@Controller("api/v1/organizations/:organizationId/expenses")
export class ExpenseController {
  constructor(@Inject(ExpenseService) private readonly service: ExpenseService) {}
  private context(org: string, auth?: string, corr?: string) {
    return this.service.authenticate(auth, org, corr ?? randomUUID());
  }
  @Get() async list(
    @Param("organizationId") org: string,
    @Query("state") state?: string,
    @Query("class") expenseClass?: string,
    @Query("payeePartyId") payeePartyId?: string,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") corr?: string,
  ) {
    return this.service.list(await this.context(org, auth, corr), {
      ...(state ? { state } : {}),
      ...(expenseClass ? { expenseClass } : {}),
      ...(payeePartyId ? { payeePartyId } : {}),
    });
  }
  @Get(":id") async get(
    @Param("organizationId") org: string,
    @Param("id") id: string,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") corr?: string,
  ) {
    return this.service.get(await this.context(org, auth, corr), id);
  }
  @Post() async create(
    @Param("organizationId") org: string,
    @Body() input: CreateExpenseInput,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") corr?: string,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.create(await this.context(org, auth, corr), input, key);
  }
  @Post(":id/review") async review(
    @Param("organizationId") org: string,
    @Param("id") id: string,
    @Body() input: ExpenseReviewInput,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") corr?: string,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.review(await this.context(org, auth, corr), id, input, key);
  }
  @Post(":id/:action") async transition(
    @Param("organizationId") org: string,
    @Param("id") id: string,
    @Param("action") action: string,
    @Body() input: { reason?: string; missingEvidenceTypes?: string[] },
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") corr?: string,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.transition(await this.context(org, auth, corr), id, action, input, key);
  }
}
