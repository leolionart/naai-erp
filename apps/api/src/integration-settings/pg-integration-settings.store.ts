import { createHash, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import pg, { type PoolClient } from "pg";
import { resolveOrganizationWorkflowPolicy } from "../workflow-policy/organization-workflow-policy.service.js";
import {
  createApiCredentialInStore,
  describeSecretRef,
  generateWebhookSigningSecret,
  insertAuditEvent,
  rotateApiCredentialInStore,
  runSecretTx,
  slugifyIdentity,
} from "./integration-secret.helper.js";
import type {
  ApiCredentialSummary,
  CreateApiCredentialInput,
  CreateWebhookSourceInput,
  CredentialRow,
  IntegrationSettingsContext,
  RotateSecretInput,
  StoreMutationDeps,
  UpdateApiCredentialInput,
  UpdateWebhookSourceInput,
  WebhookRow,
  WebhookSourceSummary,
} from "./integration-settings.types.js";

const DEFAULT_ALLOWED_EVENTS = [
  "expense.create",
  "purchase_invoice.create",
  "sales_invoice.create",
  "credit_note.create",
] as const;

const WEBHOOK_COLS = `id, public_id, name, actor_id, secret_ref, status, allowed_event_types, timestamp_tolerance_seconds, max_attempts, auto_record, version::text, created_by, created_at, updated_at`;
const CREDENTIAL_COLS = `id, name, actor_id, roles, status, auto_record, version::text, expires_at, created_at, updated_at`;

const toIso = (v: Date | string | null) =>
  !v ? null : v instanceof Date ? v.toISOString() : String(v);

function mapWebhookRow(row: WebhookRow): WebhookSourceSummary {
  const secret = describeSecretRef(row.secret_ref);
  return {
    kind: "webhook_source",
    id: row.id,
    publicId: row.public_id,
    name: row.name,
    actorId: row.actor_id,
    secretRef: secret.secretRef,
    secretMode: secret.secretMode,
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

  private get helperDeps(): StoreMutationDeps {
    return {
      credentialCols: CREDENTIAL_COLS,
      webhookCols: WEBHOOK_COLS,
      lockReplay: this.lockReplay.bind(this),
      saveReplay: this.saveReplay.bind(this),
      mapCredentialRow,
      mapWebhookRow,
    };
  }

  async listOverview(organizationId: string) {
    const [policy, webhooksRes, credsRes] = await Promise.all([
      resolveOrganizationWorkflowPolicy(organizationId, this.pool),
      this.pool.query<WebhookRow>(
        `select ${WEBHOOK_COLS} from integration_sources where organization_id = $1 order by created_at asc, id asc`,
        [organizationId],
      ),
      this.pool.query<CredentialRow>(
        `select ${CREDENTIAL_COLS} from api_credentials where organization_id = $1 order by created_at asc, id asc`,
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
      `select ${WEBHOOK_COLS} from integration_sources where organization_id = $1 and (id = $2 or public_id = $2) limit 1`,
      [organizationId, id],
    );
    return res.rows[0] ? mapWebhookRow(res.rows[0]) : null;
  }

  async listApiCredentials(organizationId: string): Promise<readonly ApiCredentialSummary[]> {
    const res = await this.pool.query<CredentialRow>(
      `select ${CREDENTIAL_COLS} from api_credentials where organization_id = $1 order by created_at asc, id asc`,
      [organizationId],
    );
    return res.rows.map(mapCredentialRow);
  }

  async createWebhookSource(
    context: IntegrationSettingsContext,
    input: CreateWebhookSourceInput,
    idempotencyKey: string,
  ) {
    const reqId = input.id?.trim() || null;
    const reqPub = input.publicId?.trim() || null;
    const name = input.name.trim();
    const reqActor = input.actorId?.trim() || null;
    const providedSecretRef = input.secretRef?.trim() || null;
    const status = input.status ?? "active";
    const allowedEventTypes = input.allowedEventTypes?.length
      ? [...input.allowedEventTypes]
      : [...DEFAULT_ALLOWED_EVENTS];
    const tolerance = input.timestampToleranceSeconds ?? 300;
    const maxAttempts = input.maxAttempts ?? 5;
    const autoRecord = Boolean(input.autoRecord);
    const reason = input.reason?.trim() || "Tạo nguồn tích hợp webhook";
    const hashPayload = {
      op: "integration-source:create",
      id: reqId,
      publicId: reqPub,
      name,
      actorId: reqActor,
      secretRef: providedSecretRef,
      status,
      allowedEventTypes,
      tolerance,
      maxAttempts,
      autoRecord,
    };
    const requestHash = createHash("sha256").update(JSON.stringify(hashPayload)).digest("hex");

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
        const extra = providedSecretRef ? {} : { secretRedactedOnReplay: true };
        return { ...replay, signingSecret: null, ...extra, idempotencyReplayed: true };
      }

      const generated = providedSecretRef ? null : generateWebhookSigningSecret();
      const actorId = reqActor || slugifyIdentity("wh", name);
      const secretRef = providedSecretRef ?? generated!.storedSecretRef;
      const pubId = reqPub || `wh-${randomUUID().slice(0, 12)}`;
      const vals = [
        context.organizationId,
        reqId || randomUUID(),
        pubId,
        name,
        actorId,
        secretRef,
        status,
        JSON.stringify(allowedEventTypes),
        tolerance,
        maxAttempts,
        autoRecord,
        context.actorId,
      ];
      const inserted = await client.query<WebhookRow>(
        `insert into integration_sources (organization_id, id, public_id, name, actor_id, secret_ref, status, allowed_event_types, timestamp_tolerance_seconds, max_attempts, auto_record, created_by) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12) returning ${WEBHOOK_COLS}`,
        vals,
      );
      const source = mapWebhookRow(inserted.rows[0]!);
      const auditTarget = ["integration_source", source.id, 1, "create"] as const;
      const auditEventId = await insertAuditEvent(client, context, auditTarget, [
        null,
        { ...source, reason },
      ]);
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
      return {
        ...response,
        signingSecret: generated?.signingSecret ?? null,
        idempotencyReplayed: false,
      };
    } catch (error) {
      await client.query("rollback").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  updateWebhookSource(
    context: IntegrationSettingsContext,
    id: string,
    input: UpdateWebhookSourceInput,
    expectedVersion: string | undefined,
    idempotencyKey: string,
  ) {
    return this.runUpdateTx(
      context.organizationId,
      idempotencyKey,
      "integration-source:update",
      { id, expectedVersion, input },
      async (client) => {
        const existing = (
          await client.query<WebhookRow>(
            `select ${WEBHOOK_COLS} from integration_sources where organization_id = $1 and (id = $2 or public_id = $2) for update`,
            [context.organizationId, id],
          )
        ).rows[0];
        if (!existing) throw new Error("RESOURCE_NOT_FOUND");
        if (expectedVersion && String(existing.version) !== expectedVersion)
          throw new Error("VERSION_CONFLICT");

        const reqRef = input.secretRef?.trim();
        const keepSealed =
          reqRef === undefined ||
          (reqRef === "managed" && existing.secret_ref.startsWith("sealed:"));
        const nextAllowed = input.allowedEventTypes
          ? [...input.allowedEventTypes]
          : existing.allowed_event_types;
        const nextAuto =
          input.autoRecord !== undefined
            ? Boolean(input.autoRecord)
            : Boolean(existing.auto_record);
        const nextVer = (BigInt(existing.version) + 1n).toString();
        const reason = input.reason?.trim() || "Cập nhật cấu hình nguồn tích hợp";
        const vals = [
          context.organizationId,
          existing.id,
          input.name?.trim() ?? existing.name,
          input.actorId?.trim() ?? existing.actor_id,
          keepSealed ? existing.secret_ref : reqRef,
          input.status ?? existing.status,
          JSON.stringify(nextAllowed),
          input.timestampToleranceSeconds ?? existing.timestamp_tolerance_seconds,
          input.maxAttempts ?? existing.max_attempts,
          nextAuto,
          nextVer,
        ];
        const updatedRes = await client.query<WebhookRow>(
          `update integration_sources set name = $3, actor_id = $4, secret_ref = $5, status = $6, allowed_event_types = $7::jsonb, timestamp_tolerance_seconds = $8, max_attempts = $9, auto_record = $10, version = $11::bigint, updated_at = now() where organization_id = $1 and id = $2 returning ${WEBHOOK_COLS}`,
          vals,
        );
        const source = mapWebhookRow(updatedRes.rows[0]!);
        const auditTarget = ["integration_source", source.id, nextVer, "update"] as const;
        const auditEventId = await insertAuditEvent(client, context, auditTarget, [
          mapWebhookRow(existing),
          { ...source, reason },
        ]);
        return { source, resourceVersion: source.version, auditEventId };
      },
    );
  }

  rotateWebhookSecret(
    context: IntegrationSettingsContext,
    id: string,
    input: RotateSecretInput,
    expectedVersion: string | undefined,
    idempotencyKey: string,
  ) {
    const reason = input.reason?.trim() || "Xoay vòng secret ký webhook";
    const payload = {
      id,
      expectedVersion: expectedVersion ?? null,
      reason: input.reason?.trim() || null,
    };
    return runSecretTx(
      this.pool,
      this.helperDeps,
      [
        context.organizationId,
        idempotencyKey,
        "integration-source:rotate-secret",
        payload,
        "signingSecret",
      ],
      async (client) => {
        const existing = (
          await client.query<WebhookRow>(
            `select ${WEBHOOK_COLS} from integration_sources where organization_id = $1 and (id = $2 or public_id = $2) for update`,
            [context.organizationId, id],
          )
        ).rows[0];
        if (!existing) throw new Error("RESOURCE_NOT_FOUND");
        if (expectedVersion && String(existing.version) !== expectedVersion)
          throw new Error("VERSION_CONFLICT");

        const { signingSecret, storedSecretRef } = generateWebhookSigningSecret();
        const nextVer = (BigInt(existing.version) + 1n).toString();
        const updated = await client.query<WebhookRow>(
          `update integration_sources set secret_ref = $3, version = $4::bigint, updated_at = now() where organization_id = $1 and id = $2 returning ${WEBHOOK_COLS}`,
          [context.organizationId, existing.id, storedSecretRef, nextVer],
        );
        const source = mapWebhookRow(updated.rows[0]!);
        const auditTarget = ["integration_source", source.id, nextVer, "rotate_secret"] as const;
        const auditEventId = await insertAuditEvent(client, context, auditTarget, [
          mapWebhookRow(existing),
          { ...source, reason },
        ]);
        return {
          saved: { source, resourceVersion: source.version, auditEventId },
          secret: { signingSecret },
        };
      },
    );
  }

  createApiCredential(
    context: IntegrationSettingsContext,
    input: CreateApiCredentialInput,
    idempotencyKey: string,
  ) {
    return createApiCredentialInStore(this.pool, this.helperDeps, context, input, idempotencyKey);
  }

  updateApiCredential(
    context: IntegrationSettingsContext,
    id: string,
    input: UpdateApiCredentialInput,
    expectedVersion: string | undefined,
    idempotencyKey: string,
  ) {
    return this.runUpdateTx(
      context.organizationId,
      idempotencyKey,
      "api-credential:update",
      { id, expectedVersion, input },
      async (client) => {
        const existing = (
          await client.query<CredentialRow>(
            `select ${CREDENTIAL_COLS} from api_credentials where organization_id = $1 and id = $2 for update`,
            [context.organizationId, id],
          )
        ).rows[0];
        if (!existing) throw new Error("RESOURCE_NOT_FOUND");
        if (Array.isArray(existing.roles) && existing.roles.includes("owner"))
          throw new Error("VALIDATION_FAILED");
        if (expectedVersion && String(existing.version) !== expectedVersion)
          throw new Error("VERSION_CONFLICT");

        const nextName =
          input.name === undefined
            ? existing.name
            : input.name === null
              ? null
              : input.name.trim() || null;
        const nextAuto =
          input.autoRecord !== undefined
            ? Boolean(input.autoRecord)
            : Boolean(existing.auto_record);
        const nextVer = (BigInt(existing.version) + 1n).toString();
        const reason = input.reason?.trim() || "Cập nhật khóa dịch vụ tích hợp";

        const updatedRes = await client.query<CredentialRow>(
          `update api_credentials set name = $3, auto_record = $4, status = $5, version = $6::bigint, updated_at = now() where organization_id = $1 and id = $2 returning ${CREDENTIAL_COLS}`,
          [
            context.organizationId,
            id,
            nextName,
            nextAuto,
            input.status ?? existing.status,
            nextVer,
          ],
        );
        const credential = mapCredentialRow(updatedRes.rows[0]!);
        const auditTarget = ["api_credential", credential.id, nextVer, "update"] as const;
        const auditEventId = await insertAuditEvent(client, context, auditTarget, [
          mapCredentialRow(existing),
          { ...credential, reason },
        ]);
        return { credential, resourceVersion: credential.version, auditEventId };
      },
    );
  }

  rotateApiCredential(
    context: IntegrationSettingsContext,
    id: string,
    input: RotateSecretInput,
    expectedVersion: string | undefined,
    idempotencyKey: string,
  ) {
    return rotateApiCredentialInStore(this.pool, this.helperDeps, context, {
      id,
      input,
      expectedVersion,
      key: idempotencyKey,
    });
  }

  private async runUpdateTx<T extends Record<string, unknown>>(
    orgId: string,
    key: string,
    op: string,
    payload: Record<string, unknown>,
    fn: (client: PoolClient) => Promise<T>,
  ) {
    const hash = createHash("sha256")
      .update(JSON.stringify({ op, ...payload }))
      .digest("hex");
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const replay = await this.lockReplay(client, orgId, key, hash);
      if (replay) {
        await client.query("rollback");
        return { ...replay, idempotencyReplayed: true };
      }
      const response = await fn(client);
      await this.saveReplay(client, orgId, key, op, hash, response);
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
      `select request_hash, response_body from api_idempotency_records where organization_id = $1 and idempotency_key = $2 for update`,
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
      `insert into api_idempotency_records (organization_id, idempotency_key, operation, request_hash, response_body) values ($1, $2, $3, $4, $5)`,
      [organizationId, idempotencyKey, operation, requestHash, response],
    );
  }
}
