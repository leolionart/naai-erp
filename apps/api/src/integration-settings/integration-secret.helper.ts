import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { openSecret, sealSecret } from "../telegram-settings/secret-box.js";
import type {
  CreateApiCredentialInput,
  CredentialRow,
  IntegrationSettingsContext,
  RotateCall,
  StoreMutationDeps,
} from "./integration-settings.types.js";

export const ALLOWED_SERVICE_ROLES = new Set(["accountant", "finance_admin", "approver", "viewer"]);
const DEV_KEY = "naai-erp-dev-webhook-secret-key-min-32-chars";
const PURPOSE = "webhook-signing-secret";

export function slugifyIdentity(prefix: "svc" | "wh", name: string): string {
  const slug =
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/gi, "d")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32)
      .replace(/-+$/g, "") || "integration";
  return `${prefix}-${slug}-${randomUUID().slice(0, 6)}`;
}

export function generateServiceToken(): { secretToken: string; tokenHash: string } {
  const secretToken = `naai_sk_${randomBytes(24).toString("base64url")}`;
  return { secretToken, tokenHash: createHash("sha256").update(secretToken).digest("hex") };
}

function encryptionKey(env: NodeJS.ProcessEnv = process.env): string {
  const secretKey = env.SESSION_SECRET?.trim() || (env.NODE_ENV !== "production" ? DEV_KEY : "");
  if (secretKey.length < 32) throw new Error("SESSION_SECRET_MISSING");
  return secretKey;
}

export function generateWebhookSigningSecret(env: NodeJS.ProcessEnv = process.env) {
  const signingSecret = `naai_whsec_${randomBytes(24).toString("base64url")}`;
  return {
    signingSecret,
    storedSecretRef: `sealed:${sealSecret(signingSecret, encryptionKey(env), PURPOSE)}`,
  };
}

export function resolveWebhookSigningSecret(
  secretRef: string,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (!secretRef.startsWith("sealed:")) return env[secretRef];
  const key = encryptionKey(env);
  try {
    return openSecret(secretRef.slice(7), key, PURPOSE);
  } catch {
    return undefined;
  }
}

export function describeSecretRef(secretRef: string): {
  secretRef: string;
  secretMode: "managed" | "env";
} {
  return secretRef.startsWith("sealed:")
    ? { secretRef: "managed", secretMode: "managed" }
    : { secretRef, secretMode: "env" };
}

export async function insertAuditEvent(
  client: PoolClient,
  ctx: IntegrationSettingsContext,
  target: readonly ["api_credential" | "integration_source", string, string | number, string],
  states: readonly [unknown, unknown],
): Promise<string> {
  const id = randomUUID();
  const row = [ctx.organizationId, id, ...target, ctx.actorId, ctx.correlationId, ...states];
  await client.query(
    `insert into resource_audit_events (organization_id, id, resource_type, resource_key, resource_version, action, actor_id, correlation_id, before_state, after_state) values ($1, $2, $3, $4, $5::bigint, $6, $7, $8, $9, $10)`,
    row,
  );
  return id;
}

export async function runSecretTx<
  TSaved extends Record<string, unknown>,
  TSecret extends Record<string, unknown>,
>(
  pool: Pool,
  deps: StoreMutationDeps,
  meta: readonly [orgId: string, key: string, op: string, payload: unknown, secretKey: string],
  fn: (client: PoolClient) => Promise<{ saved: TSaved; secret: TSecret }>,
) {
  const [orgId, key, op, payload, secretKey] = meta;
  const hash = createHash("sha256").update(JSON.stringify({ op, payload })).digest("hex");
  const client = await pool.connect();
  try {
    await client.query("begin");
    const replay = await deps.lockReplay(client, orgId, key, hash);
    if (replay) {
      await client.query("rollback");
      return {
        ...replay,
        [secretKey]: null,
        secretRedactedOnReplay: true,
        idempotencyReplayed: true,
      };
    }
    const { saved, secret } = await fn(client);
    await deps.saveReplay(client, orgId, key, op, hash, saved);
    await client.query("commit");
    return { ...saved, ...secret, idempotencyReplayed: false };
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export function createApiCredentialInStore(
  pool: Pool,
  deps: StoreMutationDeps,
  ctx: IntegrationSettingsContext,
  input: CreateApiCredentialInput,
  key: string,
) {
  const reqId = input.id?.trim() || null;
  const name = input.name.trim();
  const reqActor = input.actorId?.trim() || null;
  const roles = input.roles?.length ? [...input.roles] : ["accountant"];
  const autoRecord = Boolean(input.autoRecord);
  const expiresAt = input.expiresAt ?? null;
  const reason = input.reason?.trim() || "Tạo khóa dịch vụ tích hợp";
  const payload = { id: reqId, name, actorId: reqActor, roles, autoRecord, expiresAt };

  return runSecretTx(
    pool,
    deps,
    [ctx.organizationId, key, "api-credential:create", payload, "secretToken"],
    async (client) => {
      const { secretToken, tokenHash } = generateServiceToken();
      const actorId = reqActor || slugifyIdentity("svc", name);
      const vals = [
        ctx.organizationId,
        reqId || randomUUID(),
        name,
        actorId,
        tokenHash,
        JSON.stringify(roles),
        autoRecord,
        expiresAt,
      ];
      const res = await client.query<CredentialRow>(
        `insert into api_credentials (organization_id, id, name, actor_id, token_hash, roles, status, auto_record, expires_at) values ($1, $2, $3, $4, $5, $6::jsonb, 'active', $7, $8) returning ${deps.credentialCols}`,
        vals,
      );
      const credential = deps.mapCredentialRow(res.rows[0]!);
      const auditTarget = ["api_credential", credential.id, 1, "create"] as const;
      const auditEventId = await insertAuditEvent(client, ctx, auditTarget, [
        null,
        { ...credential, reason },
      ]);
      return {
        saved: { credential, resourceVersion: credential.version, auditEventId },
        secret: { secretToken },
      };
    },
  );
}

export function rotateApiCredentialInStore(
  pool: Pool,
  deps: StoreMutationDeps,
  ctx: IntegrationSettingsContext,
  call: RotateCall,
) {
  const reason = call.input.reason?.trim() || "Xoay vòng khóa dịch vụ tích hợp";
  const payload = {
    id: call.id,
    expectedVersion: call.expectedVersion ?? null,
    reason: call.input.reason?.trim() || null,
  };

  return runSecretTx(
    pool,
    deps,
    [ctx.organizationId, call.key, "api-credential:rotate", payload, "secretToken"],
    async (client) => {
      const existing = (
        await client.query<CredentialRow>(
          `select ${deps.credentialCols} from api_credentials where organization_id = $1 and id = $2 for update`,
          [ctx.organizationId, call.id],
        )
      ).rows[0];
      if (!existing) throw new Error("RESOURCE_NOT_FOUND");
      if (
        (Array.isArray(existing.roles) && existing.roles.includes("owner")) ||
        existing.status === "revoked"
      )
        throw new Error("VALIDATION_FAILED");
      if (call.expectedVersion && String(existing.version) !== call.expectedVersion)
        throw new Error("VERSION_CONFLICT");

      const { secretToken, tokenHash } = generateServiceToken();
      const nextVer = (BigInt(existing.version) + 1n).toString();
      const updated = await client.query<CredentialRow>(
        `update api_credentials set token_hash = $3, version = $4::bigint, updated_at = now() where organization_id = $1 and id = $2 returning ${deps.credentialCols}`,
        [ctx.organizationId, call.id, tokenHash, nextVer],
      );
      const credential = deps.mapCredentialRow(updated.rows[0]!);
      const auditTarget = ["api_credential", credential.id, nextVer, "rotate"] as const;
      const auditEventId = await insertAuditEvent(client, ctx, auditTarget, [
        deps.mapCredentialRow(existing),
        { ...credential, reason },
      ]);
      return {
        saved: { credential, resourceVersion: credential.version, auditEventId },
        secret: { secretToken },
      };
    },
  );
}
