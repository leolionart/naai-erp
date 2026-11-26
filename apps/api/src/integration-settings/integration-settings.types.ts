import type { ActorContext } from "../master-data/master-data.types.js";

export type IntegrationSettingsContext = ActorContext;

export type WebhookSourceSummary = Readonly<{
  kind: "webhook_source";
  id: string;
  publicId: string;
  name: string;
  actorId: string;
  secretRef: string;
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
  actorId: string;
  secretRef: string;
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

export type UpdateApiCredentialInput = Readonly<{
  name?: string | null;
  autoRecord?: boolean;
  reason?: string;
}>;
