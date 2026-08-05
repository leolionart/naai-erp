import { Body, Controller, Get, Headers, Inject, Param, Patch, Post, Query } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { OutboundEventService } from "./outbound-event.service.js";
import type {
  CreateOutboundEndpointInput,
  ReplayOutboundEventInput,
  UpdateOutboundEndpointInput,
} from "./outbound-event.types.js";

function page(limit?: string) {
  if (!limit) return undefined;
  const parsed = Number(limit);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 200) throw new Error("VALIDATION_FAILED");
  return parsed;
}

@Controller("api/v1/organizations/:organizationId/outbound-events")
export class OutboundEventController {
  constructor(@Inject(OutboundEventService) private readonly service: OutboundEventService) {}

  private context(organizationId: string, authorization?: string, correlationId?: string) {
    return this.service.authenticate(authorization, organizationId, correlationId ?? randomUUID());
  }

  @Get("endpoints")
  async listEndpoints(
    @Param("organizationId") organizationId: string,
    @Query("status") status?: string,
    @Query("eventType") eventType?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    const parsedLimit = page(limit);
    return this.service.listEndpoints(
      await this.context(organizationId, authorization, correlationId),
      {
        ...(status ? { status } : {}),
        ...(eventType ? { eventType } : {}),
        ...(cursor ? { cursor } : {}),
        ...(parsedLimit ? { limit: parsedLimit } : {}),
      },
    );
  }

  @Get("endpoints/:endpointId")
  async getEndpoint(
    @Param("organizationId") organizationId: string,
    @Param("endpointId") endpointId: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.service.getEndpoint(
      await this.context(organizationId, authorization, correlationId),
      endpointId,
    );
  }

  @Post("endpoints")
  async createEndpoint(
    @Param("organizationId") organizationId: string,
    @Body() input: CreateOutboundEndpointInput,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return this.service.createEndpoint(
      await this.context(organizationId, authorization, correlationId),
      input,
      idempotencyKey,
    );
  }

  @Patch("endpoints/:endpointId")
  async updateEndpoint(
    @Param("organizationId") organizationId: string,
    @Param("endpointId") endpointId: string,
    @Body() input: UpdateOutboundEndpointInput,
    @Headers("if-match") expectedVersion?: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return this.service.updateEndpoint(
      await this.context(organizationId, authorization, correlationId),
      endpointId,
      expectedVersion,
      input,
      idempotencyKey,
    );
  }

  @Get("outbox")
  async listOutbox(
    @Param("organizationId") organizationId: string,
    @Query("state") state?: string,
    @Query("eventType") eventType?: string,
    @Query("aggregateType") aggregateType?: string,
    @Query("aggregateId") aggregateId?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    const parsedLimit = page(limit);
    return this.service.listOutbox(
      await this.context(organizationId, authorization, correlationId),
      {
        ...(state ? { state } : {}),
        ...(eventType ? { eventType } : {}),
        ...(aggregateType ? { aggregateType } : {}),
        ...(aggregateId ? { aggregateId } : {}),
        ...(cursor ? { cursor } : {}),
        ...(parsedLimit ? { limit: parsedLimit } : {}),
      },
    );
  }

  @Get("outbox/:eventId")
  async getOutboxEvent(
    @Param("organizationId") organizationId: string,
    @Param("eventId") eventId: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.service.getOutboxEvent(
      await this.context(organizationId, authorization, correlationId),
      eventId,
    );
  }

  @Get("deliveries")
  async listDeliveries(
    @Param("organizationId") organizationId: string,
    @Query("outboxEventId") outboxEventId?: string,
    @Query("endpointId") endpointId?: string,
    @Query("state") state?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    const parsedLimit = page(limit);
    return this.service.listDeliveries(
      await this.context(organizationId, authorization, correlationId),
      {
        ...(outboxEventId ? { outboxEventId } : {}),
        ...(endpointId ? { endpointId } : {}),
        ...(state ? { state } : {}),
        ...(cursor ? { cursor } : {}),
        ...(parsedLimit ? { limit: parsedLimit } : {}),
      },
    );
  }

  @Get("deliveries/:deliveryId")
  async getDelivery(
    @Param("organizationId") organizationId: string,
    @Param("deliveryId") deliveryId: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.service.getDelivery(
      await this.context(organizationId, authorization, correlationId),
      deliveryId,
    );
  }

  @Post("outbox/:eventId/replay")
  async replay(
    @Param("organizationId") organizationId: string,
    @Param("eventId") eventId: string,
    @Body() input: ReplayOutboundEventInput,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return this.service.replay(
      await this.context(organizationId, authorization, correlationId),
      eventId,
      input,
      idempotencyKey,
    );
  }
}
