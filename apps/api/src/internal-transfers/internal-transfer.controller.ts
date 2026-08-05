import { Body, Controller, Get, Headers, Inject, Param, Post, Query } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { InternalTransferService } from "./internal-transfer.service.js";
import type {
  CreateInternalTransferInput,
  MatchInternalTransferInput,
  UnmatchInternalTransferInput,
} from "./internal-transfer.types.js";
@Controller("api/v1/organizations/:organizationId/banking/internal-transfers")
export class InternalTransferController {
  constructor(@Inject(InternalTransferService) private readonly service: InternalTransferService) {}
  private context(o: string, a?: string, c?: string) {
    return this.service.authenticate(a, o, c ?? randomUUID());
  }
  @Get() async list(
    @Param("organizationId") o: string,
    @Query("state") s?: string,
    @Query("financialAccountId") f?: string,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
  ) {
    return this.service.list(await this.context(o, a, c), {
      ...(s ? { state: s } : {}),
      ...(f ? { financialAccountId: f } : {}),
    });
  }
  @Post() async create(
    @Param("organizationId") o: string,
    @Body() i: CreateInternalTransferInput,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
    @Headers("idempotency-key") k?: string,
  ) {
    return this.service.create(await this.context(o, a, c), i, k);
  }
  @Get(":id") async get(
    @Param("organizationId") o: string,
    @Param("id") id: string,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
  ) {
    return this.service.get(await this.context(o, a, c), id);
  }
  @Post(":id/match") async match(
    @Param("organizationId") o: string,
    @Param("id") id: string,
    @Body() i: MatchInternalTransferInput,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
    @Headers("idempotency-key") k?: string,
  ) {
    return this.service.match(await this.context(o, a, c), id, i, k);
  }
  @Post(":id/unmatch") async unmatch(
    @Param("organizationId") o: string,
    @Param("id") id: string,
    @Body() i: UnmatchInternalTransferInput,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
    @Headers("idempotency-key") k?: string,
  ) {
    return this.service.unmatch(await this.context(o, a, c), id, i, k);
  }
}
