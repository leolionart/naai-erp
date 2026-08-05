import { Body, Controller, Get, Headers, Inject, Param, Post } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { JournalService } from "./journal.service.js";
import type { CreateJournalInput } from "./journal.types.js";

@Controller("api/v1/organizations/:organizationId/journals")
export class JournalController {
  constructor(@Inject(JournalService) private readonly service: JournalService) {}
  private context(organizationId: string, authorization?: string, correlationId?: string) {
    return this.service.authenticate(authorization, organizationId, correlationId ?? randomUUID());
  }
  @Get()
  async list(
    @Param("organizationId") organizationId: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.service.list(await this.context(organizationId, authorization, correlationId));
  }
  @Get(":id")
  async get(
    @Param("organizationId") organizationId: string,
    @Param("id") id: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.service.get(await this.context(organizationId, authorization, correlationId), id);
  }
  @Post()
  async create(
    @Param("organizationId") organizationId: string,
    @Body() input: CreateJournalInput,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return this.service.create(
      await this.context(organizationId, authorization, correlationId),
      input,
      idempotencyKey,
    );
  }
  @Post(":id/post")
  async post(
    @Param("organizationId") organizationId: string,
    @Param("id") id: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return this.service.post(
      await this.context(organizationId, authorization, correlationId),
      id,
      idempotencyKey,
    );
  }
}
