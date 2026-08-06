import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { API_VERSION } from "@naai-erp/contracts";
import {
  validateInboundEnvelope,
  validateInboundTimestamp,
  type InboundEnvelope,
} from "@naai-erp/domain";
import { CommercialDocumentService } from "../commercial-documents/commercial-document.service.js";
import { ExpenseService } from "../expenses/expense.service.js";
import { MasterDataService } from "../master-data/master-data.service.js";
import { PgInboundWebhookStore } from "./pg-inbound-webhook.store.js";
import type {
  InboundAdminContext,
  IntegrationSource,
  VerifiedInbound,
} from "./inbound-webhook.types.js";

const ADMIN = new Set(["owner", "finance_admin", "accountant"]);

@Injectable()
export class InboundWebhookService {
  constructor(
    @Inject(PgInboundWebhookStore) private readonly store: PgInboundWebhookStore,
    @Inject(CommercialDocumentService) private readonly documents: CommercialDocumentService,
    @Inject(ExpenseService) private readonly expenses: ExpenseService,
    @Inject(MasterDataService) private readonly master: MasterDataService,
  ) {}
  authenticate(authorization: string | undefined, org: string, correlationId: string) {
    return this.master.authenticate(authorization, org, correlationId);
  }
  async receive(
    publicId: string,
    rawBody: Buffer | undefined,
    body: unknown,
    headers: {
      timestamp?: string;
      signature?: string;
      idempotencyKey?: string;
      correlationId: string;
    },
  ) {
    const source = await this.store.source(publicId);
    if (!source || source.status !== "active") throw new Error("WEBHOOK_SOURCE_UNAUTHORIZED");
    if (!rawBody || !headers.timestamp || !headers.signature || !headers.idempotencyKey)
      throw new Error("WEBHOOK_AUTH_REQUIRED");
    const timestamp = validateInboundTimestamp(
      headers.timestamp,
      Math.floor(Date.now() / 1000),
      source.timestampToleranceSeconds,
    );
    this.verify(source, headers.timestamp, rawBody, headers.signature);
    const payloadSha256 = createHash("sha256").update(rawBody).digest("hex");
    let envelope: InboundEnvelope;
    try {
      envelope = validateInboundEnvelope(body);
    } catch (error) {
      const fallback = this.fallbackEnvelope(body);
      const verified = {
        source,
        envelope: fallback,
        rawPayload: this.asRecord(body),
        payloadSha256,
        timestamp,
        idempotencyKey: headers.idempotencyKey,
        correlationId: headers.correlationId,
      } satisfies VerifiedInbound;
      const received = await this.store.receive(verified);
      if (received.idempotencyReplayed)
        return this.envelope(source.organizationId, headers.correlationId, received);
      const code = error instanceof Error ? error.message : "WEBHOOK_SCHEMA_INVALID";
      const result = await this.store.finish(
        source.organizationId,
        received.messageId,
        source.actorId,
        headers.correlationId,
        "quarantined",
        undefined,
        { code, summary: "Authenticated payload requires review" },
      );
      return this.envelope(source.organizationId, headers.correlationId, {
        ...result,
        idempotencyReplayed: false,
        nextActions: ["review", "replay"],
      });
    }
    if (!source.allowedEventTypes.includes(envelope.eventType)) {
      const received = await this.store.receive({
        source,
        envelope,
        rawPayload: this.asRecord(body),
        payloadSha256,
        timestamp,
        idempotencyKey: headers.idempotencyKey,
        correlationId: headers.correlationId,
      });
      if (received.idempotencyReplayed)
        return this.envelope(source.organizationId, headers.correlationId, received);
      const result = await this.store.finish(
        source.organizationId,
        received.messageId,
        source.actorId,
        headers.correlationId,
        "quarantined",
        undefined,
        { code: "WEBHOOK_EVENT_NOT_ALLOWED", summary: "Event type is not enabled for this source" },
      );
      return this.envelope(source.organizationId, headers.correlationId, {
        ...result,
        idempotencyReplayed: false,
        nextActions: ["review", "replay"],
      });
    }
    return this.process({
      source,
      envelope,
      rawPayload: this.asRecord(body),
      payloadSha256,
      timestamp,
      idempotencyKey: headers.idempotencyKey,
      correlationId: headers.correlationId,
    });
  }
  async list(context: InboundAdminContext, state?: string) {
    if (!context.roles.some((role) => ADMIN.has(role))) throw new Error("FORBIDDEN");
    return this.envelope(context.organizationId, context.correlationId, {
      items: await this.store.list(context.organizationId, state),
    });
  }
  async get(context: InboundAdminContext, id: string) {
    if (!context.roles.some((role) => ADMIN.has(role))) throw new Error("FORBIDDEN");
    const item = await this.store.get(context.organizationId, id);
    if (!item) throw new Error("RESOURCE_NOT_FOUND");
    return this.envelope(context.organizationId, context.correlationId, item);
  }
  private async process(input: VerifiedInbound) {
    const received = await this.store.receive(input);
    if (received.idempotencyReplayed)
      return this.envelope(input.source.organizationId, input.correlationId, received);
    try {
      const context = {
        organizationId: input.source.organizationId,
        actorId: input.source.actorId,
        roles: ["integration"],
        correlationId: input.correlationId,
      };
      const key = `inbound:${input.source.id}:${input.envelope.eventType}:${input.envelope.externalId}`;
      const response =
        input.envelope.eventType === "expense.create"
          ? await this.expenses.create(context, input.envelope.data as never, key)
          : await this.documents.create(context, input.envelope.data as never, key);
      const result = await this.store.finish(
        input.source.organizationId,
        received.messageId,
        input.source.actorId,
        input.correlationId,
        "processed",
        response as Record<string, unknown>,
      );
      return this.envelope(input.source.organizationId, input.correlationId, {
        ...result,
        idempotencyReplayed: false,
        nextActions: ["get"],
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : "WEBHOOK_PROCESSING_FAILED";
      const result = await this.store.finish(
        input.source.organizationId,
        received.messageId,
        input.source.actorId,
        input.correlationId,
        "quarantined",
        undefined,
        { code, summary: "Business validation or mapping requires review" },
      );
      return this.envelope(input.source.organizationId, input.correlationId, {
        ...result,
        idempotencyReplayed: false,
        nextActions: ["review", "replay"],
      });
    }
  }
  private verify(source: IntegrationSource, timestamp: string, raw: Buffer, signature: string) {
    const secret = process.env[source.secretRef];
    if (!secret) throw new Error("WEBHOOK_SOURCE_UNAUTHORIZED");
    const expected = createHmac("sha256", secret).update(`${timestamp}.`).update(raw).digest("hex");
    const provided = signature.startsWith("sha256=") ? signature.slice(7) : "";
    if (
      !/^[0-9a-f]{64}$/.test(provided) ||
      !timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(provided, "hex"))
    )
      throw new Error("WEBHOOK_SIGNATURE_INVALID");
  }
  private fallbackEnvelope(body: unknown): InboundEnvelope {
    const raw = this.asRecord(body);
    return {
      schemaVersion: typeof raw.schemaVersion === "number" ? raw.schemaVersion : 0,
      eventType: "expense.create",
      externalId:
        typeof raw.externalId === "string" && raw.externalId
          ? raw.externalId
          : `quarantine-${randomId(raw)}`,
      occurredAt: typeof raw.occurredAt === "string" ? raw.occurredAt : new Date(0).toISOString(),
      data: {},
    };
  }
  private asRecord(body: unknown) {
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : { invalidPayload: true };
  }
  private envelope(org: string, requestId: string, data: unknown) {
    return { apiVersion: API_VERSION, requestId, organizationId: org, data };
  }
}
function randomId(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}
