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
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (url.protocol !== "https:" || url.username || url.password || isPrivateHost(host))
      throw new Error("OUTBOUND_ENDPOINT_INVALID");
  }
}

/**
 * OWASP A10 (SSRF): reject literal loopback, private, link-local, CGNAT and metadata targets,
 * including IPv6 and IPv4-mapped forms. Hostnames that merely resolve privately are additionally
 * blocked by network policy at the worker egress boundary.
 */
export function isPrivateHost(host: string): boolean {
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "metadata.google.internal"
  )
    return true;
  const mapped = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  const ipv4 = mapped ?? host;
  const octets = ipv4
    .match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
    ?.slice(1)
    .map(Number);
  if (octets) {
    const [a, b] = octets as [number, number, number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (host.includes(":")) {
    return (
      host === "::" ||
      host === "::1" ||
      /^f[cd]/.test(host) ||
      /^fe[89ab]/.test(host) ||
      host.startsWith("::ffff:")
    );
  }
  return false;
}
