import { Body, Controller, Get, Headers, Inject, Param, Patch, Post } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { IntegrationSettingsService } from "./integration-settings.service.js";
import type {
  CreateApiCredentialInput,
  CreateWebhookSourceInput,
  RotateSecretInput,
  UpdateApiCredentialInput,
  UpdateWebhookSourceInput,
} from "./integration-settings.types.js";

function unwrapDataPayload<T>(body: unknown): T {
  if (body && typeof body === "object" && !Array.isArray(body) && "data" in body) {
    const inner = (body as { data?: unknown }).data;
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      return inner as T;
    }
  }
  return (body ?? {}) as T;
}

@Controller("api/v1/organizations/:organizationId")
export class IntegrationSettingsController {
  constructor(
    @Inject(IntegrationSettingsService) private readonly service: IntegrationSettingsService,
  ) {}

  private context(organizationId: string, authorization?: string, correlationId?: string) {
    return this.service.authenticate(authorization, organizationId, correlationId ?? randomUUID());
  }

  @Get("integration-sources")
  async listOverview(
    @Param("organizationId") organizationId: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.service.listOverview(
      await this.context(organizationId, authorization, correlationId),
    );
  }

  @Get("integration-sources/:id")
  async getWebhookSource(
    @Param("organizationId") organizationId: string,
    @Param("id") id: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.service.getWebhookSource(
      await this.context(organizationId, authorization, correlationId),
      id,
    );
  }

  @Post("integration-sources")
  async createWebhookSource(
    @Param("organizationId") organizationId: string,
    @Body() body: unknown,
    @Headers("authorization") authorization?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.service.createWebhookSource(
      await this.context(organizationId, authorization, correlationId),
      unwrapDataPayload<CreateWebhookSourceInput>(body),
      idempotencyKey,
    );
  }

  @Patch("integration-sources/:id")
  async updateWebhookSource(
    @Param("organizationId") organizationId: string,
    @Param("id") id: string,
    @Body() body: unknown,
    @Headers("authorization") authorization?: string,
    @Headers("if-match") expectedVersion?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.service.updateWebhookSource(
      await this.context(organizationId, authorization, correlationId),
      id,
      unwrapDataPayload<UpdateWebhookSourceInput>(body),
      expectedVersion,
      idempotencyKey,
    );
  }

  @Post("integration-sources/:id/rotate-secret")
  async rotateWebhookSecret(
    @Param("organizationId") organizationId: string,
    @Param("id") id: string,
    @Body() body: unknown,
    @Headers("authorization") authorization?: string,
    @Headers("if-match") expectedVersion?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.service.rotateWebhookSecret(
      await this.context(organizationId, authorization, correlationId),
      id,
      unwrapDataPayload<RotateSecretInput>(body),
      expectedVersion,
      idempotencyKey,
    );
  }

  @Get("api-credentials")
  async listApiCredentials(
    @Param("organizationId") organizationId: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.service.listApiCredentials(
      await this.context(organizationId, authorization, correlationId),
    );
  }

  @Post("api-credentials")
  async createApiCredential(
    @Param("organizationId") organizationId: string,
    @Body() body: unknown,
    @Headers("authorization") authorization?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.service.createApiCredential(
      await this.context(organizationId, authorization, correlationId),
      unwrapDataPayload<CreateApiCredentialInput>(body),
      idempotencyKey,
    );
  }

  @Patch("api-credentials/:id")
  async updateApiCredential(
    @Param("organizationId") organizationId: string,
    @Param("id") id: string,
    @Body() body: unknown,
    @Headers("authorization") authorization?: string,
    @Headers("if-match") expectedVersion?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.service.updateApiCredential(
      await this.context(organizationId, authorization, correlationId),
      id,
      unwrapDataPayload<UpdateApiCredentialInput>(body),
      expectedVersion,
      idempotencyKey,
    );
  }

  @Post("api-credentials/:id/rotate")
  async rotateApiCredential(
    @Param("organizationId") organizationId: string,
    @Param("id") id: string,
    @Body() body: unknown,
    @Headers("authorization") authorization?: string,
    @Headers("if-match") expectedVersion?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.service.rotateApiCredential(
      await this.context(organizationId, authorization, correlationId),
      id,
      unwrapDataPayload<RotateSecretInput>(body),
      expectedVersion,
      idempotencyKey,
    );
  }
}
