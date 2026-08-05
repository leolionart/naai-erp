import { Inject, Injectable } from "@nestjs/common";
import { API_VERSION } from "@naai-erp/contracts";
import { MasterDataService } from "../master-data/master-data.service.js";
import {
  OUTBOUND_EVENT_ADMIN_STORE,
  type OutboundDeliveryFilters,
  type CreateOutboundEndpointInput,
  type OutboundEndpointFilters,
  type OutboundEventAdminStore,
  type OutboundEventContext,
  type OutboxEventFilters,
  type ReplayOutboundEventInput,
  type UpdateOutboundEndpointInput,
} from "./outbound-event.types.js";

const READ_ROLES = new Set([
  "owner",
  "finance_admin",
  "accountant",
  "approver",
  "viewer",
  "integration",
]);
const REPLAY_ROLES = new Set(["owner", "finance_admin", "accountant"]);
const CONFIGURE_ROLES = new Set(["owner", "finance_admin"]);

@Injectable()
export class OutboundEventService {
  constructor(
    @Inject(OUTBOUND_EVENT_ADMIN_STORE) private readonly store: OutboundEventAdminStore,
    @Inject(MasterDataService) private readonly masterData: MasterDataService,
  ) {}

  authenticate(authorization: string | undefined, organizationId: string, correlationId: string) {
    return this.masterData.authenticate(authorization, organizationId, correlationId);
  }

  private envelope(context: OutboundEventContext, data: unknown) {
    return {
      apiVersion: API_VERSION,
      requestId: context.correlationId,
      organizationId: context.organizationId,
      data,
    };
  }

  private assertRead(context: OutboundEventContext) {
    if (!context.roles.some((role) => READ_ROLES.has(role))) throw new Error("FORBIDDEN");
  }

  async listEndpoints(context: OutboundEventContext, filters: OutboundEndpointFilters) {
    this.assertRead(context);
    return this.envelope(context, await this.store.listEndpoints(context.organizationId, filters));
  }

  async getEndpoint(context: OutboundEventContext, endpointId: string) {
    this.assertRead(context);
    const endpoint = await this.store.getEndpoint(context.organizationId, endpointId);
    if (!endpoint) throw new Error("RESOURCE_NOT_FOUND");
    return this.envelope(context, endpoint);
  }

  async createEndpoint(
    context: OutboundEventContext,
    input: CreateOutboundEndpointInput,
    idempotencyKey?: string,
  ) {
    if (!context.roles.some((role) => CONFIGURE_ROLES.has(role))) throw new Error("FORBIDDEN");
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    this.validateEndpoint(input);
    return this.envelope(context, await this.store.createEndpoint(context, input, idempotencyKey));
  }

  async updateEndpoint(
    context: OutboundEventContext,
    endpointId: string,
    expectedVersion: string | undefined,
    input: UpdateOutboundEndpointInput,
    idempotencyKey?: string,
  ) {
    if (!context.roles.some((role) => CONFIGURE_ROLES.has(role))) throw new Error("FORBIDDEN");
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    if (!expectedVersion || !/^\d+$/.test(expectedVersion)) throw new Error("VALIDATION_FAILED");
    if (input.endpointUrl) this.validateEndpointUrl(input.endpointUrl);
    return this.envelope(
      context,
      await this.store.updateEndpoint(context, endpointId, expectedVersion, input, idempotencyKey),
    );
  }

  async listOutbox(context: OutboundEventContext, filters: OutboxEventFilters) {
    this.assertRead(context);
    return this.envelope(context, await this.store.listOutbox(context.organizationId, filters));
  }

  async getOutboxEvent(context: OutboundEventContext, eventId: string) {
    this.assertRead(context);
    const event = await this.store.getOutboxEvent(context.organizationId, eventId);
    if (!event) throw new Error("RESOURCE_NOT_FOUND");
    return this.envelope(context, event);
  }

  async listDeliveries(context: OutboundEventContext, filters: OutboundDeliveryFilters) {
    this.assertRead(context);
    return this.envelope(context, await this.store.listDeliveries(context.organizationId, filters));
  }

  async getDelivery(context: OutboundEventContext, deliveryId: string) {
    this.assertRead(context);
    const delivery = await this.store.getDelivery(context.organizationId, deliveryId);
    if (!delivery) throw new Error("RESOURCE_NOT_FOUND");
    return this.envelope(context, delivery);
  }

  async replay(
    context: OutboundEventContext,
    eventId: string,
    input: ReplayOutboundEventInput,
    idempotencyKey?: string,
  ) {
    if (!context.roles.some((role) => REPLAY_ROLES.has(role))) throw new Error("FORBIDDEN");
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    if (!input.reason?.trim()) throw new Error("VALIDATION_FAILED");
    return this.envelope(
      context,
      await this.store.replay(
        context,
        eventId,
        {
          reason: input.reason.trim(),
          ...(input.endpointId?.trim() ? { endpointId: input.endpointId.trim() } : {}),
        },
        idempotencyKey,
      ),
    );
  }

  private validateEndpoint(input: CreateOutboundEndpointInput) {
    if (!input.name?.trim() || !input.secretRef?.trim() || !input.eventTypes?.length)
      throw new Error("VALIDATION_FAILED");
    this.validateEndpointUrl(input.endpointUrl);
  }

  private validateEndpointUrl(endpointUrl: string) {
    let url: URL;
    try {
      url = new URL(endpointUrl);
    } catch {
      throw new Error("OUTBOUND_ENDPOINT_INVALID");
    }
    const host = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      host === "localhost" ||
      host === "::1" ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    )
      throw new Error("OUTBOUND_ENDPOINT_INVALID");
  }
}
