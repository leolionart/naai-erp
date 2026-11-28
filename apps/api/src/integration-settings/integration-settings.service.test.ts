import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { MasterDataService } from "../master-data/master-data.service.js";
import {
  describeSecretRef,
  generateServiceToken,
  generateWebhookSigningSecret,
  resolveWebhookSigningSecret,
  slugifyIdentity,
} from "./integration-secret.helper.js";
import { IntegrationSettingsService } from "./integration-settings.service.js";
import { PgIntegrationSettingsStore } from "./pg-integration-settings.store.js";
import type { IntegrationSettingsContext } from "./integration-settings.types.js";

const zipRow = (cols: string, vals: unknown[], extra: Record<string, unknown> = {}) =>
  Object.assign(Object.fromEntries(cols.split(",").map((c, i) => [c, vals[i]])), extra);

const CRED_INSERT = "organization_id,id,name,actor_id,token_hash,roles,auto_record,expires_at";
const WH_INSERT =
  "organization_id,id,public_id,name,actor_id,secret_ref,status,allowed_event_types,timestamp_tolerance_seconds,max_attempts,auto_record,created_by";

function makeFakeStore() {
  const creds = new Map<string, Record<string, unknown>>();
  const sources = new Map<string, Record<string, unknown>>();
  const replays = new Map<
    string,
    { request_hash: string; response_body: Record<string, unknown> }
  >();
  const audits: unknown[][] = [];
  const base = {
    version: "1",
    created_at: "2026-11-28T10:00:00Z",
    updated_at: "2026-11-28T10:00:00Z",
  };

  creds.set(
    "org-1:cred-owner",
    zipRow(CRED_INSERT, ["org-1", "cred-owner", "Owner", "owner-1", "h", ["owner"], false, null], {
      ...base,
      status: "active",
    }),
  );

  const query = async (sql: string, p: unknown[] = []) => {
    const q = sql.replace(/\s+/g, " ").trim().toLowerCase();
    const k = `${p[0]}:${p[1]}`;
    if (
      q === "begin" ||
      q === "commit" ||
      q === "rollback" ||
      q.startsWith("select pg_advisory_xact_lock")
    )
      return { rows: [] };
    if (q.startsWith("select request_hash"))
      return { rows: replays.has(k) ? [replays.get(k)!] : [] };
    if (q.startsWith("insert into api_idempotency_records")) {
      replays.set(k, {
        request_hash: String(p[3]),
        response_body: p[4] as Record<string, unknown>,
      });
      return { rows: [] };
    }
    if (q.startsWith("insert into resource_audit_events")) {
      audits.push(p);
      return { rows: [] };
    }
    if (q.startsWith("insert into api_credentials")) {
      const r = zipRow(CRED_INSERT, p, {
        ...base,
        roles: JSON.parse(String(p[5])),
        status: "active",
      });
      creds.set(k, r);
      return { rows: [r] };
    }
    if (q.includes("from api_credentials where organization_id = $1 and id = $2"))
      return { rows: creds.has(k) ? [creds.get(k)!] : [] };
    if (q.includes("from api_credentials where organization_id = $1 order"))
      return { rows: [...creds.values()] };
    if (q.startsWith("update api_credentials set token_hash")) {
      const r = { ...creds.get(k)!, token_hash: p[2], version: String(p[3]) };
      creds.set(k, r);
      return { rows: [r] };
    }
    if (q.startsWith("update api_credentials set name")) {
      const r = {
        ...creds.get(k)!,
        name: p[2],
        auto_record: Boolean(p[3]),
        status: p[4],
        version: String(p[5]),
      };
      creds.set(k, r);
      return { rows: [r] };
    }
    if (q.startsWith("insert into integration_sources")) {
      const r = zipRow(WH_INSERT, p, { ...base, allowed_event_types: JSON.parse(String(p[7])) });
      sources.set(k, r);
      return { rows: [r] };
    }
    if (q.includes("from integration_sources where organization_id = $1")) {
      const hit = [...sources.values()].find(
        (r) => r.organization_id === p[0] && (r.id === p[1] || r.public_id === p[1]),
      );
      return { rows: hit ? [hit] : [] };
    }
    if (q.startsWith("update integration_sources set secret_ref")) {
      const r = { ...sources.get(k)!, secret_ref: p[2], version: String(p[3]) };
      sources.set(k, r);
      return { rows: [r] };
    }
    throw new Error(`Unexpected SQL: ${q}`);
  };

  const store = new PgIntegrationSettingsStore();
  (store as unknown as { pool: unknown }).pool = {
    query,
    connect: async () => ({ query, release: () => {} }),
  };
  return {
    service: new IntegrationSettingsService(store, {} as MasterDataService),
    creds,
    sources,
    replays,
    audits,
  };
}

const ctx = (roles: readonly string[], actorId = "owner-1"): IntegrationSettingsContext => ({
  organizationId: "org-1",
  actorId,
  roles,
  correlationId: "corr-1013",
});

describe("T-UNIT-ERP-1013-001 self-service Service Key and Webhook Secret lifecycle", () => {
  it("slugifies Vietnamese names and round-trips service tokens and sealed/env webhook secrets", () => {
    expect(slugifyIdentity("svc", "Đẩy chứng từ n8n!")).toMatch(
      /^svc-day-chung-tu-n8n-[0-9a-f]{6}$/,
    );
    expect(slugifyIdentity("wh", "!!!")).toMatch(/^wh-integration-[0-9a-f]{6}$/);

    const { secretToken, tokenHash } = generateServiceToken();
    expect(secretToken).toMatch(/^naai_sk_[A-Za-z0-9_-]{32}$/);
    expect(createHash("sha256").update(secretToken).digest("hex")).toBe(tokenHash);

    const env: NodeJS.ProcessEnv = {
      NODE_ENV: "production",
      SESSION_SECRET: "prod-session-secret-key-at-least-32-chars!!",
      LEGACY_WH: "legacy-hmac",
    };
    const { signingSecret, storedSecretRef } = generateWebhookSigningSecret(env);
    expect(signingSecret).toMatch(/^naai_whsec_[A-Za-z0-9_-]{32}$/);
    expect(storedSecretRef.startsWith("sealed:v1.")).toBe(true);
    expect(describeSecretRef(storedSecretRef)).toEqual({
      secretRef: "managed",
      secretMode: "managed",
    });
    expect(resolveWebhookSigningSecret(storedSecretRef, env)).toBe(signingSecret);
    expect(resolveWebhookSigningSecret("sealed:corrupted", env)).toBeUndefined();
    expect(describeSecretRef("LEGACY_WH")).toEqual({ secretRef: "LEGACY_WH", secretMode: "env" });
    expect(resolveWebhookSigningSecret("LEGACY_WH", env)).toBe("legacy-hmac");
    expect(() =>
      generateWebhookSigningSecret({ NODE_ENV: "production", SESSION_SECRET: "short" }),
    ).toThrow("SESSION_SECRET_MISSING");
  });

  it("creates Service Keys with default accountant role, enforces RBAC/role/idempotency rules, and redacts replay/audit", async () => {
    const { service, creds, replays, audits } = makeFakeStore();
    await expect(
      service.createApiCredential(ctx(["accountant"]), { name: "Bot" }, "k1"),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      service.createApiCredential(ctx(["viewer"]), { name: "Bot" }, "k2"),
    ).rejects.toThrow("FORBIDDEN");
    await expect(service.listApiCredentials(ctx(["viewer"]))).rejects.toThrow("FORBIDDEN");
    await expect(service.createApiCredential(ctx(["owner"]), { name: "Bot" })).rejects.toThrow(
      "IDEMPOTENCY_KEY_REQUIRED",
    );
    await expect(
      service.createApiCredential(ctx(["owner"]), { name: "Escalate", roles: ["owner"] }, "k3"),
    ).rejects.toThrow("VALIDATION_FAILED");
    await expect(
      service.createApiCredential(ctx(["owner"]), { name: "Empty", roles: [] }, "k4"),
    ).rejects.toThrow("VALIDATION_FAILED");

    const created = await service.createApiCredential(
      ctx(["finance_admin"]),
      { id: "cred-ai", name: "Trợ lý Kế toán AI" },
      "idem-c1",
    );
    const data = created.data as Record<string, unknown> & {
      credential: Record<string, unknown>;
      secretToken: string;
    };
    expect(data.secretToken).toMatch(/^naai_sk_/);
    expect(data.idempotencyReplayed).toBe(false);
    expect(data.credential).toMatchObject({
      id: "cred-ai",
      roles: ["accountant"],
      isOwnerCredential: false,
    });
    expect(data.credential.actorId).toMatch(/^svc-tro-ly-ke-toan-ai-[0-9a-f]{6}$/);
    expect(creds.get("org-1:cred-ai")!.token_hash).toBe(
      createHash("sha256").update(data.secretToken).digest("hex"),
    );
    expect(JSON.stringify(audits)).not.toContain(data.secretToken);
    expect(JSON.stringify([...replays.values()])).not.toContain(data.secretToken);

    const replayed = await service.createApiCredential(
      ctx(["finance_admin"]),
      { id: "cred-ai", name: "Trợ lý Kế toán AI" },
      "idem-c1",
    );
    expect(replayed.data).toMatchObject({
      secretToken: null,
      secretRedactedOnReplay: true,
      idempotencyReplayed: true,
    });
  });

  it("protects owner credentials from mutation/rotation and rotates & revokes non-owner Service Keys", async () => {
    const { service, creds, audits } = makeFakeStore();
    await service.createApiCredential(
      ctx(["owner"]),
      { id: "cred-svc", name: "CLI", roles: ["finance_admin"] },
      "idem-init",
    );
    const initialHash = creds.get("org-1:cred-svc")!.token_hash;

    await expect(
      service.updateApiCredential(
        ctx(["owner"]),
        "cred-owner",
        { status: "revoked" },
        undefined,
        "own-p",
      ),
    ).rejects.toThrow("VALIDATION_FAILED");
    await expect(
      service.rotateApiCredential(ctx(["owner"]), "cred-owner", {}, undefined, "own-r"),
    ).rejects.toThrow("VALIDATION_FAILED");

    const rotated = await service.rotateApiCredential(
      ctx(["owner"]),
      "cred-svc",
      { reason: "Rotate" },
      "1",
      "idem-rot",
    );
    const rotData = rotated.data as { secretToken: string; resourceVersion: string };
    expect(rotData.secretToken).toMatch(/^naai_sk_/);
    expect(rotData.resourceVersion).toBe("2");
    expect(creds.get("org-1:cred-svc")!.token_hash).not.toBe(initialHash);
    expect(JSON.stringify(audits)).not.toContain(rotData.secretToken);

    const revoked = await service.updateApiCredential(
      ctx(["owner"]),
      "cred-svc",
      { status: "revoked" },
      "2",
      "idem-rev",
    );
    expect((revoked.data as { credential: unknown }).credential).toMatchObject({
      status: "revoked",
      version: "3",
    });
    await expect(
      service.rotateApiCredential(ctx(["owner"]), "cred-svc", {}, undefined, "idem-rev-rot"),
    ).rejects.toThrow("VALIDATION_FAILED");
  });

  it("issues and rotates managed sealed webhook secrets without leaking ciphertext or plaintext in reads/audits", async () => {
    const { service, sources, replays, audits } = makeFakeStore();
    const created = await service.createWebhookSource(
      ctx(["owner"]),
      { id: "wh-1", name: "Cổng Paperless Tự Động" },
      "idem-wh-1",
    );
    const whData = created.data as { source: Record<string, unknown>; signingSecret: string };
    expect(whData.signingSecret).toMatch(/^naai_whsec_/);
    expect(whData.source).toMatchObject({
      id: "wh-1",
      secretRef: "managed",
      secretMode: "managed",
    });
    expect(whData.source.actorId).toMatch(/^wh-cong-paperless-tu-dong-[0-9a-f]{6}$/);

    const rawRef = String(sources.get("org-1:wh-1")!.secret_ref);
    expect(rawRef.startsWith("sealed:v1.")).toBe(true);
    expect(resolveWebhookSigningSecret(rawRef)).toBe(whData.signingSecret);
    expect(JSON.stringify(audits)).not.toContain("sealed:");
    expect(JSON.stringify(audits)).not.toContain(whData.signingSecret);
    expect(JSON.stringify([...replays.values()])).not.toContain(whData.signingSecret);
    expect((await service.getWebhookSource(ctx(["accountant"]), "wh-1")).data).toMatchObject({
      id: "wh-1",
      secretRef: "managed",
      secretMode: "managed",
    });

    const rotated = await service.rotateWebhookSecret(
      ctx(["owner"]),
      "wh-1",
      { reason: "Rotate" },
      "1",
      "idem-wh-rot",
    );
    const rotWh = rotated.data as { signingSecret: string; resourceVersion: string };
    expect(rotWh.signingSecret).toMatch(/^naai_whsec_/);
    expect(rotWh.signingSecret).not.toBe(whData.signingSecret);
    expect(rotWh.resourceVersion).toBe("2");
    expect(resolveWebhookSigningSecret(String(sources.get("org-1:wh-1")!.secret_ref))).toBe(
      rotWh.signingSecret,
    );
  });
});
