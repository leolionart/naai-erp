import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { MasterDataService } from "./master-data.service.js";
import type { MutationInput } from "./master-data.types.js";

@Controller("api/v1/organizations/:organizationId/master-data")
export class MasterDataController {
  constructor(@Inject(MasterDataService) private readonly service: MasterDataService) {}

  private async context(organizationId: string, authorization?: string, correlationId?: string) {
    return this.service.authenticate(authorization, organizationId, correlationId ?? randomUUID());
  }

  @Get("resources")
  async resources(
    @Param("organizationId") organizationId: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    const context = await this.context(organizationId, authorization, correlationId);
    return {
      apiVersion: "v1",
      requestId: context.correlationId,
      organizationId,
      data: this.service.resources(),
    };
  }

  @Get(":resource")
  async list(
    @Param("organizationId") organizationId: string,
    @Param("resource") resource: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
    @Query("kind") kind?: string,
    @Query("is_active") isActive?: string,
  ) {
    const context = await this.context(organizationId, authorization, correlationId);
    return this.service.list(resource, context, cursor, Number.parseInt(limit ?? "50", 10), {
      ...(kind ? { kind } : {}),
      ...(isActive !== undefined ? { is_active: isActive === "true" } : {}),
    });
  }

  @Post(":resource/import/dry-run")
  async importDryRun(
    @Param("organizationId") organizationId: string,
    @Param("resource") resource: string,
    @Body() input: { rows?: readonly Record<string, unknown>[] },
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    const context = await this.context(organizationId, authorization, correlationId);
    return this.service.dryRunImport(resource, context, input.rows ?? []);
  }

  @Get(":resource/export")
  async export(
    @Param("organizationId") organizationId: string,
    @Param("resource") resource: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    const context = await this.context(organizationId, authorization, correlationId);
    return this.service.export(resource, context);
  }

  @Get(":resource/:key")
  async get(
    @Param("organizationId") organizationId: string,
    @Param("resource") resource: string,
    @Param("key") key: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    const context = await this.context(organizationId, authorization, correlationId);
    return this.service.get(resource, key, context);
  }

  @Post(":resource")
  async create(
    @Param("organizationId") organizationId: string,
    @Param("resource") resource: string,
    @Body() input: MutationInput,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const context = await this.context(organizationId, authorization, correlationId);
    return this.service.mutate("create", resource, undefined, context, input, idempotencyKey);
  }

  @Patch(":resource/:key")
  async update(
    @Param("organizationId") organizationId: string,
    @Param("resource") resource: string,
    @Param("key") key: string,
    @Body() input: MutationInput,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
    @Headers("if-match") expectedVersion?: string,
  ) {
    const context = await this.context(organizationId, authorization, correlationId);
    return this.service.mutate(
      "update",
      resource,
      key,
      context,
      { ...input, ...(expectedVersion ? { expectedVersion } : {}) },
      idempotencyKey,
    );
  }

  @Post(":resource/:key/deactivate")
  async deactivate(
    @Param("organizationId") organizationId: string,
    @Param("resource") resource: string,
    @Param("key") key: string,
    @Body() input: MutationInput,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const context = await this.context(organizationId, authorization, correlationId);
    return this.service.mutate("deactivate", resource, key, context, input, idempotencyKey);
  }

  @Delete(":resource/:key")
  async delete(
    @Param("organizationId") organizationId: string,
    @Param("resource") resource: string,
    @Param("key") key: string,
    @Body() input: { reason?: string },
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
    @Headers("if-match") expectedVersion?: string,
  ) {
    const context = await this.context(organizationId, authorization, correlationId);
    return this.service.delete(
      resource,
      key,
      context,
      input.reason,
      expectedVersion,
      idempotencyKey,
    );
  }
}
