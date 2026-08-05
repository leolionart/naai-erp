import { createHmac } from "node:crypto";

export type LeasedOutboundDelivery = Readonly<{
  organizationId: string;
  deliveryId: string;
  outboxEventId: string;
  eventType: string;
  schemaVersion: number;
  payload: Readonly<Record<string, unknown>>;
  correlationId: string;
  occurredAt: string;
  endpointUrl: string;
  secretRef: string;
  attemptNumber: number;
  maxAttempts: number;
  timeoutSeconds: number;
  baseDelaySeconds: number;
  maxDelaySeconds: number;
}>;

export type DeliveryCompletion = Readonly<{
  outcome: "delivered" | "retryable_failure" | "permanent_failure";
  httpStatus?: number;
  responseSummary?: string;
  errorCode?: string;
  errorSummary?: string;
  nextRetryAt?: Date;
}>;

export interface OutboundDeliveryStore {
  materializePending(limit: number): Promise<number>;
  releaseExpiredLeases(now: Date): Promise<number>;
  leaseDue(input: {
    now: Date;
    workerId: string;
    limit: number;
    leaseSeconds: number;
  }): Promise<readonly LeasedOutboundDelivery[]>;
  complete(
    delivery: LeasedOutboundDelivery,
    workerId: string,
    completion: DeliveryCompletion,
  ): Promise<void>;
}

export type DeliveryFetch = (
  input: string,
  init: RequestInit,
) => Promise<Pick<Response, "status" | "text">>;

export function outboundEnvelope(delivery: LeasedOutboundDelivery) {
  return {
    schemaVersion: delivery.schemaVersion,
    id: delivery.outboxEventId,
    type: delivery.eventType,
    organizationId: delivery.organizationId,
    occurredAt: delivery.occurredAt,
    correlationId: delivery.correlationId,
    data: delivery.payload,
  };
}

export function signOutboundPayload(secret: string, timestamp: string, rawBody: string) {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`;
}

export function retryDelaySeconds(
  attemptNumber: number,
  baseDelaySeconds: number,
  maxDelaySeconds: number,
) {
  return Math.min(maxDelaySeconds, baseDelaySeconds * 2 ** Math.max(0, attemptNumber - 1));
}

export function classifyStatus(status: number): DeliveryCompletion["outcome"] {
  if (status >= 200 && status < 300) return "delivered";
  if (status === 408 || status === 425 || status === 429 || status >= 500)
    return "retryable_failure";
  return "permanent_failure";
}

export function redactResponseSummary(value: string) {
  return value
    .slice(0, 2000)
    .replace(
      /(authorization|token|api[_-]?key|secret|password)(["'\s:=]+)[^,"'\s}]+/gi,
      "$1$2[REDACTED]",
    )
    .replace(/bearer\s+[a-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
    .slice(0, 1000);
}

export class OutboundDeliveryRunner {
  constructor(
    private readonly store: OutboundDeliveryStore,
    private readonly fetcher: DeliveryFetch,
    private readonly secretLookup: (secretRef: string) => string | undefined,
    private readonly workerId: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async runBatch(limit = 20, leaseSeconds = 60) {
    const materialized = await this.store.materializePending(limit * 4);
    // Materialization uses the database clock for next_attempt_at. Capture the leasing cutoff only
    // after that write completes, otherwise a newly-created delivery can be a few microseconds newer
    // than the cutoff and be skipped until the next worker tick.
    const leaseAt = this.now();
    const released = await this.store.releaseExpiredLeases(leaseAt);
    const deliveries = await this.store.leaseDue({
      now: leaseAt,
      workerId: this.workerId,
      limit,
      leaseSeconds,
    });
    const results = await Promise.all(deliveries.map((delivery) => this.deliver(delivery)));
    return {
      materialized,
      released,
      leased: deliveries.length,
      delivered: results.filter((result) => result === "delivered").length,
      failed: results.filter((result) => result !== "delivered").length,
    };
  }

  private async deliver(delivery: LeasedOutboundDelivery) {
    const secret = this.secretLookup(delivery.secretRef);
    if (!secret) {
      await this.store.complete(delivery, this.workerId, {
        outcome: "permanent_failure",
        errorCode: "OUTBOUND_SECRET_UNAVAILABLE",
        errorSummary: "Webhook signing secret is not available to the worker",
      });
      return "permanent_failure" as const;
    }
    const rawBody = JSON.stringify(outboundEnvelope(delivery));
    const timestamp = String(Math.floor(this.now().getTime() / 1000));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), delivery.timeoutSeconds * 1000);
    try {
      const response = await this.fetcher(delivery.endpointUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-naai-event-id": delivery.outboxEventId,
          "x-naai-event-type": delivery.eventType,
          "x-naai-schema-version": String(delivery.schemaVersion),
          "x-naai-timestamp": timestamp,
          "x-naai-signature": signOutboundPayload(secret, timestamp, rawBody),
          "x-correlation-id": delivery.correlationId,
        },
        body: rawBody,
        signal: controller.signal,
      });
      const responseSummary = redactResponseSummary(await response.text());
      const outcome = classifyStatus(response.status);
      await this.store.complete(
        delivery,
        this.workerId,
        outcome === "retryable_failure" && delivery.attemptNumber < delivery.maxAttempts
          ? {
              outcome,
              httpStatus: response.status,
              responseSummary,
              nextRetryAt: new Date(
                this.now().getTime() +
                  retryDelaySeconds(
                    delivery.attemptNumber,
                    delivery.baseDelaySeconds,
                    delivery.maxDelaySeconds,
                  ) *
                    1000,
              ),
            }
          : { outcome, httpStatus: response.status, responseSummary },
      );
      return outcome;
    } catch (error) {
      const retryable = delivery.attemptNumber < delivery.maxAttempts;
      await this.store.complete(delivery, this.workerId, {
        outcome: retryable ? "retryable_failure" : "permanent_failure",
        errorCode:
          error instanceof Error && error.name === "AbortError"
            ? "OUTBOUND_TIMEOUT"
            : "OUTBOUND_NETWORK_ERROR",
        errorSummary: error instanceof Error ? error.message : "Outbound delivery failed",
        ...(retryable
          ? {
              nextRetryAt: new Date(
                this.now().getTime() +
                  retryDelaySeconds(
                    delivery.attemptNumber,
                    delivery.baseDelaySeconds,
                    delivery.maxDelaySeconds,
                  ) *
                    1000,
              ),
            }
          : {}),
      });
      return retryable ? ("retryable_failure" as const) : ("permanent_failure" as const);
    } finally {
      clearTimeout(timeout);
    }
  }
}
