export type OutboundStoreContext = Readonly<{
  organizationId: string;
  actorId: string;
  correlationId: string;
}>;

export type OutboundSubscriptionInput = Readonly<{
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

export type LeasedOutboundDelivery = Readonly<{
  organizationId: string;
  deliveryId: string;
  outboxEventId: string;
  subscriptionId: string;
  endpointUrl: string;
  secretRef: string;
  timeoutSeconds: number;
  eventType: string;
  schemaVersion: number;
  payload: Record<string, unknown>;
  correlationId: string;
  occurredAt: string;
  attemptNumber: number;
  leaseExpiresAt: string;
}>;

export type OutboundAttemptResult = Readonly<{
  outcome: "delivered" | "retryable_failure" | "permanent_failure" | "lease_expired";
  startedAt: string;
  httpStatus?: number;
  responseSummary?: string;
  errorCode?: string;
  errorSummary?: string;
  isManualReplay?: boolean;
  replayActorId?: string;
  replayReason?: string;
}>;
