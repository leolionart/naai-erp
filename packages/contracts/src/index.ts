export const API_VERSION = "v1" as const;

export type ApiError = Readonly<{
  code: string;
  message: string;
  retryable: boolean;
  details?: Readonly<Record<string, unknown>>;
  remediation?: string;
}>;

export type ApiEnvelope<T> = Readonly<{
  apiVersion: typeof API_VERSION;
  requestId: string;
  organizationId: string;
  data?: T;
  error?: ApiError;
}>;

export type MutationMetadata = Readonly<{
  resourceVersion: string;
  auditEventId: string;
  correlationId: string;
  idempotencyReplayed: boolean;
  nextActions: readonly string[];
}>;

export type CursorPage<T> = Readonly<{
  items: readonly T[];
  nextCursor?: string;
}>;
