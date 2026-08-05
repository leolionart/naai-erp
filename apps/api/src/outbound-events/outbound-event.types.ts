import type { JournalActorContext } from "../journals/journal.types.js";

export type OutboundEventContext = JournalActorContext;

export type OutboundEndpointFilters = Readonly<{
  status?: string;
  eventType?: string;
  cursor?: string;
  limit?: number;
}>;

export type OutboxEventFilters = Readonly<{
  state?: string;
  eventType?: string;
  aggregateType?: string;
  aggregateId?: string;
  cursor?: string;
  limit?: number;
}>;

export type OutboundDeliveryFilters = Readonly<{
  outboxEventId?: string;
  endpointId?: string;
  state?: string;
  cursor?: string;
  limit?: number;
}>;

export type ReplayOutboundEventInput = Readonly<{
  reason: string;
  endpointId?: string;
}>;

export type CreateOutboundEndpointInput = Readonly<{
  id?: string;
  name: string;
  endpointUrl: string;
  eventTypes: readonly string[];
  secretRef: string;
  maxAttempts?: number;
  timeoutSeconds?: number;
  baseDelaySeconds?: number;
  maxDelaySeconds?: number;
}>;

export type UpdateOutboundEndpointInput = Readonly<
  Partial<Omit<CreateOutboundEndpointInput, "id">> & {
    status?: "active" | "paused" | "disabled";
  }
>;

export type OutboundEventAdminStore = Readonly<{
  listEndpoints(organizationId: string, filters: OutboundEndpointFilters): Promise<unknown>;
  getEndpoint(organizationId: string, endpointId: string): Promise<unknown | undefined>;
  createEndpoint(
    context: OutboundEventContext,
    input: CreateOutboundEndpointInput,
    idempotencyKey: string,
  ): Promise<unknown>;
  updateEndpoint(
    context: OutboundEventContext,
    endpointId: string,
    expectedVersion: string,
    input: UpdateOutboundEndpointInput,
    idempotencyKey: string,
  ): Promise<unknown>;
  listOutbox(organizationId: string, filters: OutboxEventFilters): Promise<unknown>;
  getOutboxEvent(organizationId: string, eventId: string): Promise<unknown | undefined>;
  listDeliveries(organizationId: string, filters: OutboundDeliveryFilters): Promise<unknown>;
  getDelivery(organizationId: string, deliveryId: string): Promise<unknown | undefined>;
  replay(
    context: OutboundEventContext,
    eventId: string,
    input: ReplayOutboundEventInput,
    idempotencyKey: string,
  ): Promise<unknown>;
}>;

export const OUTBOUND_EVENT_ADMIN_STORE = Symbol("OUTBOUND_EVENT_ADMIN_STORE");
