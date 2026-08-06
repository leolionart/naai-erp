import { Body, Controller, Get, Headers, Inject, Param, Post, Query, Req } from "@nestjs/common";
import type { RawBodyRequest } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { InboundWebhookService } from "./inbound-webhook.service.js";

@Controller()
export class InboundWebhookController {
  constructor(@Inject(InboundWebhookService) private readonly service: InboundWebhookService) {}
  @Post("api/v1/inbound/:sourcePublicId/events") receive(
    @Param("sourcePublicId") source: string,
    @Req() request: RawBodyRequest<FastifyRequest>,
    @Body() body: unknown,
    @Headers("x-naai-timestamp") timestamp?: string,
    @Headers("x-naai-signature") signature?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.service.receive(source, request.rawBody, body, {
      ...(timestamp ? { timestamp } : {}),
      ...(signature ? { signature } : {}),
      ...(idempotencyKey ? { idempotencyKey } : {}),
      correlationId: correlationId ?? randomUUID(),
    });
  }
  @Get("api/v1/organizations/:organizationId/inbound-events") async list(
    @Param("organizationId") org: string,
    @Query("state") state?: string,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    const context = await this.service.authenticate(auth, org, correlationId ?? randomUUID());
    return this.service.list(context, state);
  }
  @Get("api/v1/organizations/:organizationId/inbound-events/:id") async get(
    @Param("organizationId") org: string,
    @Param("id") id: string,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    const context = await this.service.authenticate(auth, org, correlationId ?? randomUUID());
    return this.service.get(context, id);
  }
}
