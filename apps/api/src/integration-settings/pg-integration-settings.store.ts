import { createHash, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import pg, { type PoolClient } from "pg";
import { resolveOrganizationWorkflowPolicy } from "../workflow-policy/organization-workflow-policy.service.js";
import type {
  ApiCredentialSummary,
  CreateWebhookSourceInput,
  IntegrationSettingsContext,
  UpdateApiCredentialInput,
  UpdateWebhookSourceInput,
  WebhookSourceSummary,
} from "./integration-settings.types.js";

const DEFAULT_ALLOWED_EVENTS = [
  "expense.create",
  "purchase_invoice.create",
  "sales_invoice.create",
  "credit_note.create",
] as const;

type WebhookRow = {
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

type CredentialRow = {
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

function toIso(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function mapWebhookRow(row: WebhookRow): WebhookSourceSummary {
  return {
    kind: "webhook_source",
    id: row.id,
    publicId: row.public_id,
    name: row.name,
    actorId: row.actor_id,
    secretRef: row.secret_ref,
    status: row.status,
    allowedEventTypes: row.allowed_event_types ?? [],
    timestampToleranceSeconds: Number(row.timestamp_tolerance_seconds),
    maxAttempts: Number(row.max_attempts),
    autoRecord: Boolean(row.auto_record),
    version: String(row.version),
    createdBy: row.created_by,
    createdAt: toIso(row.created_at) ?? "",
    updatedAt: toIso(row.updated_at) ?? "",
  };
}

function mapCredentialRow(row: CredentialRow): ApiCredentialSummary {
  const roles = Array.isArray(row.roles) ? row.roles : [];
  return {
    kind: "api_credential",
    id: row.id,
    name: row.name ?? null,
    actorId: row.actor_id,
    roles,
    status: row.status,
    autoRecord: Boolean(row.auto_record),
    isOwnerCredential: roles.includes("owner"),
    version: String(row.version),
    expiresAt: toIso(row.expires_at),
    createdAt: toIso(row.created_at) ?? "",
    updatedAt: toIso(row.updated_at) ?? "",
  };
}

@Injectable()
export class PgIntegrationSettingsStore {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  async listOverview(organizationId: string) {
    const [policy, webhooksRes, credsRes] = await Promise.all([
      resolveOrganizationWorkflowPolicy(organizationId, this.pool),
      this.pool.query<WebhookRow>(
        `select id, public_id, name, actor_id, secret_ref, status, allowed_event_types,
                timestamp_tolerance_seconds, max_attempts, auto_record, version::text,
                created_by, created_at, updated_at
           from integration_sources
          where organization_id = $1
          order by created_at asc, id asc`,
        [organizationId],
      ),
      this.pool.query<CredentialRow>(
        `select id, name, actor_id, roles, status, auto_record, version::text,
                expires_at, created_at, updated_at
           from api_credentials
          where organization_id = $1
          order by created_at asc, id asc`,
        [organizationId],
      ),
    ]);
    const webhookSources = webhooksRes.rows.map(mapWebhookRow);
    const apiCredentials = credsRes.rows.map(mapCredentialRow);
    return {
      operatingMode: policy.operatingMode,
      webhookSources,
      apiCredentials,
      items: [...apiCredentials, ...webhookSources],
    };
  }

  async getWebhookSource(organizationId: string, id: string): Promise<WebhookSourceSummary | null> {
    const res = await this.pool.query<WebhookRow>(
      `select id, public_id, name, actor_id, secret_ref, status, allowed_event_types,
              timestamp_tolerance_seconds, max_attempts, auto_record, version::text,
              created_by, created_at, updated_at
         from integration_sources
        where organization_id = $1 and (id = $2 or public_id = $2)
        limit 1`,
      [organizationId, id],
    );
    return res.rows[0] ? mapWebhookRow(res.rows[0]) : null;
  }

  async listApiCredentials(organizationId: string): Promise<readonly ApiCredentialSummary[]> {
    const res = await this.pool.query<CredentialRow>(
      `select id, name, actor_id, roles, status, auto_record, version::text,
              expires_at, created_at, updated_at
         from api_credentials
        where organization_id = $1
        order by created_at asc, id asc`,
      [organizationId],
    );
    return res.rows.map(mapCredentialRow);
  }

  async createWebhookSource(
    context: IntegrationSettingsContext,
    input: CreateWebhookSourceInput,
    idempotencyKey: string,
  ) {
    const id = input.id?.trim() || randomUUID();
    const publicId = input.publicId?.trim() || `wh-${randomUUID().slice(0, 12)}`;
    const status = input.status ?? "active";
    const allowedEventTypes = input.allowedEventTypes?.length
      ? [...input.allowedEventTypes]
      : [...DEFAULT_ALLOWED_EVENTS];
    const tolerance = input.timestampToleranceSeconds ?? 300;
    const maxAttempts = input.maxAttempts ?? 5;
    const autoRecord = Boolean(input.autoRecord);
    const reason = input.reason?.trim() || "Tạo nguồn tích hợp webhook";
    const requestHash = createHash("sha256")
      .update(
        JSON.stringify({
          op: "integration-source:create",
          id,
          publicId,
          name: input.name,
          actorId: input.actorId,
          secretRef: input.secretRef,
          status,
          allowedEventTypes,
          tolerance,
          maxAttempts,
          autoRecord,
        }),
      )
      .digest("hex");

    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const replay = await this.lockReplay(
        client,
        context.organizationId,
        idempotencyKey,
        requestHash,
      );
      if (replay) {
        await client.query("rollback");
        return { ...replay, idempotencyReplayed: true };
      }

      const inserted = await client.query<WebhookRow>(
        `insert into integration_sources
           (organization_id, id, public_id, name, actor_id, secret_ref, status,
            allowed_event_types, timestamp_tolerance_seconds, max_attempts, auto_record, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12)
         returning id, public_id, name, actor_id, secret_ref, status, allowed_event_types,
                   timestamp_tolerance_seconds, max_attempts, auto_record, version::text,
                   created_by, created_at, updated_at`,
        [
          context.organizationId,
          id,
          publicId,
          input.name.trim(),
          input.actorId.trim(),
          input.secretRef.trim(),
          status,
          JSON.stringify(allowedEventTypes),
          tolerance,
          maxAttempts,
          autoRecord,
          context.actorId,
        ],
      );
      const source = mapWebhookRow(inserted.rows[0]!);
      const auditEventId = randomUUID();
      await client.query(
        `insert into resource_audit_events
           (organization_id, id, resource_type, resource_key, resource_version, action, actor_id, correlation_id, after_state)
         values ($1, $2, 'integration_source', $3, 1, 'create', $4, $5, $6)`,
        [
          context.organizationId,
          auditEventId,
          source.id,
          context.actorId,
          context.correlationId,
          { ...source, reason },
        ],
      );
      const response = { source, resourceVersion: source.version, auditEventId };
      await this.saveReplay(
        client,
        context.organizationId,
        idempotencyKey,
        "integration-source:create",
        requestHash,
        response,
      );
      await client.query("commit");
      return { ...response, idempotencyReplayed: false };
    } catch (error) {
      await client.query("rollback").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async updateWebhookSource(
    context: IntegrationSettingsContext,
    id: string,
    input: UpdateWebhookSourceInput,
    expectedVersion: string | undefined,
    idempotencyKey: string,
  ) {
    const requestHash = createHash("sha256")
      .update(JSON.stringify({ op: "integration-source:update", id, expectedVersion, input }))
      .digest("hex");

    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const replay = await this.lockReplay(
        client,
        context.organizationId,
        idempotencyKey,
        requestHash,
      );
      if (replay) {
        await client.query("rollback");
        return { ...replay, idempotencyReplayed: true };
      }

      const existingRes = await client.query<WebhookRow>(
        `select id, public_id, name, actor_id, secret_ref, status, allowed_event_types,
                timestamp_tolerance_seconds, max_attempts, auto_record, version::text,
                created_by, created_at, updated_at
           from integration_sources
          where organization_id = $1 and (id = $2 or public_id = $2)
          for update`,
        [context.organizationId, id],
      );
      const existing = existingRes.rows[0];
      if (!existing) throw new Error("RESOURCE_NOT_FOUND");
      if (expectedVersion && String(existing.version) !== expectedVersion) {
        throw new Error("VERSION_CONFLICT");
      }

      const nextName = input.name?.trim() ?? existing.name;
      const nextActor = input.actorId?.trim() ?? existing.actor_id;
      const nextSecretRef = input.secretRef?.trim() ?? existing.secret_ref;
      const nextStatus = input.status ?? existing.status;
      const nextAllowed = input.allowedEventTypes
        ? [...input.allowedEventTypes]
        : existing.allowed_event_types;
      const nextTolerance = input.timestampToleranceSeconds ?? existing.timestamp_tolerance_seconds;
      const nextMaxAttempts = input.maxAttempts ?? existing.max_attempts;
      const nextAutoRecord =
        input.autoRecord !== undefined ? Boolean(input.autoRecord) : Boolean(existing.auto_record);
      const nextVersion = (BigInt(existing.version) + 1n).toString();
      const reason = input.reason?.trim() || "Cập nhật cấu hình nguồn tích hợp";

      const updatedRes = await client.query<WebhookRow>(
        `update integration_sources set
           name = $3, actor_id = $4, secret_ref = $5, status = $6,
           allowed_event_types = $7::jsonb, timestamp_tolerance_seconds = $8,
           max_attempts = $9, auto_record = $10, version = $11::bigint, updated_at = now()
         where organization_id = $1 and id = $2
         returning id, public_id, name, actor_id, secret_ref, status, allowed_event_types,
                   timestamp_tolerance_seconds, max_attempts, auto_record, version::text,
                   created_by, created_at, updated_at`,
        [
          context.organizationId,
          existing.id,
          nextName,
          nextActor,
          nextSecretRef,
          nextStatus,
          JSON.stringify(nextAllowed),
          nextTolerance,
          nextMaxAttempts,
          nextAutoRecord,
          nextVersion,
        ],
      );
      const before = mapWebhookRow(existing);
      const source = mapWebhookRow(updatedRes.rows[0]!);
      const auditEventId = randomUUID();
      await client.query(
        `insert into resource_audit_events
           (organization_id, id, resource_type, resource_key, resource_version, action, actor_id, correlation_id, before_state, after_state)
         values ($1, $2, 'integration_source', $3, $4::bigint, 'update', $5, $6, $7, $8)`,
        [
          context.organizationId,
          auditEventId,
          source.id,
          nextVersion,
          context.actorId,
          context.correlationId,
          before,
          { ...source, reason },
        ],
      );
      const response = { source, resourceVersion: source.version, auditEventId };
      await this.saveReplay(
        client,
        context.organizationId,
        idempotencyKey,
        "integration-source:update",
        requestHash,
        response,
      );
      await client.query("commit");
      return { ...response, idempotencyReplayed: false };
    } catch (error) {
      await client.query("rollback").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async updateApiCredential(
    context: IntegrationSettingsContext,
    id: string,
    input: UpdateApiCredentialInput,
    expectedVersion: string | undefined,
    idempotencyKey: string,
  ) {
    const requestHash = createHash("sha256")
      .update(JSON.stringify({ op: "api-credential:update", id, expectedVersion, input }))
      .digest("hex");

    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const replay = await this.lockReplay(
        client,
        context.organizationId,
        idempotencyKey,
        requestHash,
      );
      if (replay) {
        await client.query("rollback");
        return { ...replay, idempotencyReplayed: true };
      }

      const existingRes = await client.query<CredentialRow>(
        `select id, name, actor_id, roles, status, auto_record, version::text,
                expires_at, created_at, updated_at
           from api_credentials
          where organization_id = $1 and id = $2
          for update`,
        [context.organizationId, id],
      );
      const existing = existingRes.rows[0];
      if (!existing) throw new Error("RESOURCE_NOT_FOUND");
      if (expectedVersion && String(existing.version) !== expectedVersion) {
        throw new Error("VERSION_CONFLICT");
      }

      const nextName =
        input.name === undefined
          ? existing.name
          : input.name === null
            ? null
            : input.name.trim() || null;
      const nextAutoRecord =
        input.autoRecord !== undefined ? Boolean(input.autoRecord) : Boolean(existing.auto_record);
      const nextVersion = (BigInt(existing.version) + 1n).toString();
      const reason = input.reason?.trim() || "Cập nhật cờ tự động ghi sổ cho token tích hợp";

      const updatedRes = await client.query<CredentialRow>(
        `update api_credentials set
           name = $3, auto_record = $4, version = $5::bigint, updated_at = now()
         where organization_id = $1 and id = $2
         returning id, name, actor_id, roles, status, auto_record, version::text,
                   expires_at, created_at, updated_at`,
        [context.organizationId, id, nextName, nextAutoRecord, nextVersion],
      );
      const before = mapCredentialRow(existing);
      const credential = mapCredentialRow(updatedRes.rows[0]!);
      const auditEventId = randomUUID();
      await client.query(
        `insert into resource_audit_events
           (organization_id, id, resource_type, resource_key, resource_version, action, actor_id, correlation_id, before_state, after_state)
         values ($1, $2, 'api_credential', $3, $4::bigint, 'update', $5, $6, $7, $8)`,
        [
          context.organizationId,
          auditEventId,
          credential.id,
          nextVersion,
          context.actorId,
          context.correlationId,
          before,
          { ...credential, reason },
        ],
      );
      const response = { credential, resourceVersion: credential.version, auditEventId };
      await this.saveReplay(
        client,
        context.organizationId,
        idempotencyKey,
        "api-credential:update",
        requestHash,
        response,
      );
      await client.query("commit");
      return { ...response, idempotencyReplayed: false };
    } catch (error) {
      await client.query("rollback").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  private async lockReplay(
    client: PoolClient,
    organizationId: string,
    idempotencyKey: string,
    requestHash: string,
  ) {
    await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `${organizationId}:${idempotencyKey}`,
    ]);
    const replay = await client.query<{
      request_hash: string;
      response_body: Record<string, unknown>;
    }>(
      `select request_hash, response_body from api_idempotency_records
        where organization_id = $1 and idempotency_key = $2
        for update`,
      [organizationId, idempotencyKey],
    );
    if (!replay.rows[0]) return undefined;
    if (replay.rows[0].request_hash !== requestHash) throw new Error("IDEMPOTENCY_CONFLICT");
    return replay.rows[0].response_body;
  }

  private saveReplay(
    client: PoolClient,
    organizationId: string,
    idempotencyKey: string,
    operation: string,
    requestHash: string,
    response: unknown,
  ) {
    return client.query(
      `insert into api_idempotency_records
         (organization_id, idempotency_key, operation, request_hash, response_body)
       values ($1, $2, $3, $4, $5)`,
      [organizationId, idempotencyKey, operation, requestHash, response],
    );
  }
}
