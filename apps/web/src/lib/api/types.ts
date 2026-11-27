import { resolveApiClientErrorMessage } from "./error-messages";

export type ApiErrorBody = Readonly<{
  code?: string;
  message?: string;
  details?: unknown;
}>;

export type ApiEnvelope<T> = Readonly<{
  apiVersion?: string;
  requestId?: string;
  organizationId?: string;
  data: T;
  resourceVersion?: string;
  auditEventId?: string;
  idempotencyReplayed?: boolean;
  nextActions?: readonly string[];
  /** Present on bounded list reads (BR-READ-001): `hasMore`, `nextCursor`, `limit`, `total`. */
  page?: Readonly<{ hasMore?: boolean; nextCursor?: string; limit?: number; total?: number }>;
  /** `truncated` is set when the response or the client auto-paging stopped before the end. */
  meta?: Readonly<Record<string, unknown>>;
}>;

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(input: {
    status: number;
    code?: string;
    message?: string;
    details?: unknown;
    requestId?: string;
  }) {
    super(resolveApiClientErrorMessage(input));
    this.name = "ApiClientError";
    this.status = input.status;
    this.code = input.code ?? `HTTP_${input.status}`;
    this.details = input.details;
    this.requestId = input.requestId;
  }
}

export function isApiEnvelope<T = unknown>(value: unknown): value is ApiEnvelope<T> {
  return Boolean(value && typeof value === "object" && "data" in value);
}
