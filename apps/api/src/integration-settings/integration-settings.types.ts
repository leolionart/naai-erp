import type { PoolClient } from "pg";
import type { ActorContext } from "../master-data/master-data.types.js";

export type IntegrationSettingsContext = ActorContext;

export type WebhookSourceSummary = Readonly<{
  kind: "webhook_source";
  id: string;
  publicId: string;
  name: string;
  actorId: string;
  secretRef: string;
  secretMode?: "managed" | "env";
  status: "active" | "suspended" | "revoked";
  allowedEventTypes: readonly string[];
  timestampToleranceSeconds: number;
  maxAttempts: number;
  autoRecord: boolean;
  version: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}>;

export type ApiCredentialSummary = Readonly<{
  kind: "api_credential";
  id: string;
  name: string | null;
  actorId: string;
  roles: readonly string[];
  status: "active" | "revoked";
  autoRecord: boolean;
  isOwnerCredential: boolean;
  version: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type CreateWebhookSourceInput = Readonly<{
  id?: string;
  publicId?: string;
  name: string;
  actorId?: string;
  secretRef?: string;
  status?: "active" | "suspended" | "revoked";
  allowedEventTypes?: readonly string[];
  timestampToleranceSeconds?: number;
  maxAttempts?: number;
  autoRecord?: boolean;
  reason?: string;
}>;

export type UpdateWebhookSourceInput = Readonly<{
  name?: string;
  actorId?: string;
  secretRef?: string;
  status?: "active" | "suspended" | "revoked";
  allowedEventTypes?: readonly string[];
  timestampToleranceSeconds?: number;
  maxAttempts?: number;
  autoRecord?: boolean;
  reason?: string;
}>;

export type CreateApiCredentialInput = Readonly<{
  id?: string;
  name: string;
  actorId?: string;
  roles?: readonly string[];
  autoRecord?: boolean;
  expiresAt?: string | null;
  reason?: string;
}>;

export type UpdateApiCredentialInput = Readonly<{
  name?: string | null;
  autoRecord?: boolean;
  status?: "active" | "revoked";
  reason?: string;
}>;

export type RotateSecretInput = Readonly<{
  reason?: string;
}>;

export type RotateCall = Readonly<{
  id: string;
  input: RotateSecretInput;
  expectedVersion?: string | undefined;
  key: string;
}>;

export type WebhookRow = {
  id: string;
  public_id: string;
  name: string;
  actor_id: string;
  secret_ref: string;
  status: "active" | "suspended" | "revoked";
  allowed_event_types: string[];
  timestamp_tolerance_seconds: number;
  max_attempts: number;
  auto_record: boolean;
  version: string;
  created_by: string;
  created_at: Date | string;
  updated_at: Date | string;
};

export type CredentialRow = {
  id: string;
  name: string | null;
  actor_id: string;
  roles: string[];
  status: "active" | "revoked";
  auto_record: boolean;
  version: string;
  expires_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

export type StoreMutationDeps = {
  credentialCols: string;
  webhookCols: string;
  lockReplay: (
    client: PoolClient,
    organizationId: string,
    idempotencyKey: string,
    requestHash: string,
  ) => Promise<Record<string, unknown> | undefined>;
  saveReplay: (
    client: PoolClient,
    organizationId: string,
    idempotencyKey: string,
    operation: string,
    requestHash: string,
    response: unknown,
  ) => Promise<unknown>;
  mapCredentialRow: (row: CredentialRow) => ApiCredentialSummary;
  mapWebhookRow: (row: WebhookRow) => WebhookSourceSummary;
};
