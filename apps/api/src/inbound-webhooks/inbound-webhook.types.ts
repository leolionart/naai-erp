import type { InboundEnvelope } from "@naai-erp/domain";
import type { JournalActorContext } from "../journals/journal.types.js";

export type InboundAdminContext = JournalActorContext;
export type IntegrationSource = Readonly<{
  organizationId: string;
  id: string;
  publicId: string;
  actorId: string;
  secretRef: string;
  status: string;
  allowedEventTypes: readonly string[];
  timestampToleranceSeconds: number;
  maxAttempts: number;
}>;
export type VerifiedInbound = Readonly<{
  source: IntegrationSource;
  envelope: InboundEnvelope;
  rawPayload: Record<string, unknown>;
  payloadSha256: string;
  timestamp: number;
  idempotencyKey: string;
  correlationId: string;
}>;
