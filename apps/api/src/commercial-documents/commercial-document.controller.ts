import { Body, Controller, Get, Headers, Inject, Param, Patch, Post, Query } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { CommercialDocumentService } from "./commercial-document.service.js";
import type {
  CommercialDocumentAction,
  CommercialDocumentCategoryInput,
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
    @Query("projectId") projectId?: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.service.list(
      await this.context(organizationId, authorization, correlationId),
      type,
      state,
      partyId,
      projectId,
    );
  }
  @Get("relationship-backfill/inventory")
  async relationshipBackfillInventory(
    @Param("organizationId") organizationId: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.service.relationshipBackfillInventory(
      await this.context(organizationId, authorization, correlationId),
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
  @Patch(":id")
  async update(
    @Param("organizationId") organizationId: string,
    @Param("id") id: string,
    @Body() input: Partial<CreateCommercialDocumentInput>,
    @Headers("if-match") expectedVersion?: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return this.service.update(
      await this.context(organizationId, authorization, correlationId),
      id,
      expectedVersion ?? "",
      input,
      idempotencyKey,
    );
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
  @Patch(":id/category")
  async updateCategory(
    @Param("organizationId") organizationId: string,
    @Param("id") id: string,
    @Body() input: CommercialDocumentCategoryInput,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return this.service.updateCategory(
      await this.context(organizationId, authorization, correlationId),
      id,
      input,
      idempotencyKey,
    );
  }
  @Post(":id/reverse-replace")
  async reverseReplace(
    @Param("organizationId") organizationId: string,
    @Param("id") id: string,
    @Body() input: { replacement: CreateCommercialDocumentInput; reason: string },
    @Headers("if-match") expectedVersion?: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return this.service.reverseReplace(
      await this.context(organizationId, authorization, correlationId),
      id,
      expectedVersion ?? "",
      input.replacement,
      input.reason ?? "",
      idempotencyKey,
    );
  }
  @Post(":id/relationship-backfill/dry-run")
  async dryRunRelationshipBackfill(
    @Param("organizationId") organizationId: string,
    @Param("id") id: string,
    @Body() input: { replacement: CreateCommercialDocumentInput; reason: string },
    @Headers("if-match") expectedVersion?: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.service.dryRunRelationshipBackfill(
      await this.context(organizationId, authorization, correlationId),
      id,
      expectedVersion ?? "",
      input.replacement,
      input.reason ?? "",
    );
  }
  @Post(":id/relationship-backfill/commit")
  async commitRelationshipBackfill(
    @Param("organizationId") organizationId: string,
    @Param("id") id: string,
    @Body()
    input: { replacement: CreateCommercialDocumentInput; reason: string; planHash: string },
    @Headers("if-match") expectedVersion?: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return this.service.commitRelationshipBackfill(
      await this.context(organizationId, authorization, correlationId),
      id,
      expectedVersion ?? "",
      input.replacement,
      input.reason ?? "",
      input.planHash ?? "",
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
