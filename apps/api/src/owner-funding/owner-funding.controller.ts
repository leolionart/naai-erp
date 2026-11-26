import { Body, Controller, Get, Headers, Inject, Param, Post, Query } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { OwnerFundingService } from "./owner-funding.service.js";
import type { RecordOwnerFundingInput } from "./owner-funding.types.js";

@Controller("api/v1/organizations/:organizationId/banking/owner-funding")
export class OwnerFundingController {
  constructor(@Inject(OwnerFundingService) private readonly service: OwnerFundingService) {}

  private context(org: string, auth?: string, corr?: string) {
    return this.service.authenticate(auth, org, corr ?? randomUUID());
  }

  @Get()
  async list(
    @Param("organizationId") org: string,
    @Query("movementType") movementType?: string,
    @Query("financialAccountId") financialAccountId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") corr?: string,
  ) {
    return this.service.list(await this.context(org, auth, corr), {
      ...(movementType ? { movementType } : {}),
      ...(financialAccountId ? { financialAccountId } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    });
  }

  @Get(":id")
  async get(
    @Param("organizationId") org: string,
    @Param("id") id: string,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") corr?: string,
  ) {
    return this.service.get(await this.context(org, auth, corr), id);
  }

  @Post()
  async record(
    @Param("organizationId") org: string,
    @Body() input: RecordOwnerFundingInput,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") corr?: string,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.record(await this.context(org, auth, corr), input ?? ({} as never), key);
  }
}
