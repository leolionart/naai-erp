import { Body, Controller, Get, Headers, Inject, Param, Post, Query } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { CommercialDocumentService } from "./commercial-document.service.js";
import type {
  CommercialDocumentAction,
  CreateCommercialDocumentInput,
} from "./commercial-document.types.js";

@Controller("api/v1/organizations/:organizationId/commercial-documents")
export class CommercialDocumentController {
  constructor(
    @Inject(CommercialDocumentService) private readonly service: CommercialDocumentService,
  ) {}
  private context(organizationId: string, authorization?: string, correlationId?: string) {
    return this.service.authenticate(authorization, organizationId, correlationId ?? randomUUID());
  }
  @Get()
  async list(
    @Param("organizationId") organizationId: string,
    @Query("type") type?: string,
    @Query("state") state?: string,
    @Query("partyId") partyId?: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.service.list(
      await this.context(organizationId, authorization, correlationId),
      type,
      state,
      partyId,
    );
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
    @Body() input: CreateCommercialDocumentInput,
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
  @Post(":id/:action")
  async transition(
    @Param("organizationId") organizationId: string,
    @Param("id") id: string,
    @Param("action") action: CommercialDocumentAction,
    @Body() input: { reason?: string },
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return this.service.transition(
      await this.context(organizationId, authorization, correlationId),
      id,
      action,
      input,
      idempotencyKey,
    );
  }
}
