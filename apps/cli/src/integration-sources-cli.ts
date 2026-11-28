import { readFile } from "node:fs/promises";
import type { ExtendedCliRoute } from "./cit-client.js";
import type { CliOptions } from "./client.js";
import { sendJsonSubresourceRequest } from "./cli-http-helpers.js";

export type IntegrationSourcesCliFlags = Readonly<{
  "auto-record"?: string | undefined;
  name?: string | undefined;
  reason?: string | undefined;
  data?: string | undefined;
  file?: string | undefined;
}>;

export function isIntegrationSettingsResource(resource: string | undefined): boolean {
  return resource === "integration-sources" || resource === "api-credentials";
}

export function resolveIntegrationSourcesCliRoute(input: {
  baseUrl: string;
  organizationId: string;
  resource: string;
  action: string;
  key?: string;
}): ExtendedCliRoute | null {
  const orgRoot = `${input.baseUrl}/api/v1/organizations/${encodeURIComponent(input.organizationId)}`;
  const { resource, action, key } = input;

  if (resource === "integration-sources") {
    const base = `${orgRoot}/integration-sources`;
    if (action === "list") {
      return { method: "GET", url: base, includeBody: false };
    }
    if (action === "get") {
      if (!key) throw new Error("integration-sources get requires --key <source-id>");
      return { method: "GET", url: `${base}/${encodeURIComponent(key)}`, includeBody: false };
    }
    if (action === "create") {
      return { method: "POST", url: base, includeBody: true };
    }
    if (action === "update" || action === "set-auto-record" || action === "revoke") {
      if (!key) throw new Error(`integration-sources ${action} requires --key <source-id>`);
      return { method: "PATCH", url: `${base}/${encodeURIComponent(key)}`, includeBody: true };
    }
    if (action === "rotate-secret") {
      if (!key) throw new Error("integration-sources rotate-secret requires --key <source-id>");
      return {
        method: "POST",
        url: `${base}/${encodeURIComponent(key)}/rotate-secret`,
        includeBody: true,
      };
    }
    throw new Error(`Unsupported integration-sources action: ${action}`);
  }

  if (resource === "api-credentials") {
    const base = `${orgRoot}/api-credentials`;
    if (action === "list") {
      return { method: "GET", url: base, includeBody: false };
    }
    if (action === "create") {
      return { method: "POST", url: base, includeBody: true };
    }
    if (action === "update" || action === "set-auto-record" || action === "revoke") {
      if (!key) throw new Error(`api-credentials ${action} requires --key <credential-id>`);
      return { method: "PATCH", url: `${base}/${encodeURIComponent(key)}`, includeBody: true };
    }
    if (action === "rotate") {
      if (!key) throw new Error("api-credentials rotate requires --key <credential-id>");
      return {
        method: "POST",
        url: `${base}/${encodeURIComponent(key)}/rotate`,
        includeBody: true,
      };
    }
    throw new Error(`Unsupported api-credentials action: ${action}`);
  }

  return null;
}

function parseAutoRecordFlag(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "on") return true;
  if (normalized === "false" || normalized === "0" || normalized === "off") return false;
  throw new Error("--auto-record must be true or false");
}

export async function buildIntegrationSourcesCliPayload(
  action: string,
  flags: IntegrationSourcesCliFlags,
): Promise<Record<string, unknown> | undefined> {
  if (action === "list" || action === "get") return undefined;
  const rawText = flags.data ?? (flags.file ? await readFile(flags.file, "utf8") : undefined);
  const parsed = rawText !== undefined ? (JSON.parse(rawText) as Record<string, unknown>) : {};
  const base =
    parsed && typeof parsed === "object" && !Array.isArray(parsed) && "data" in parsed
      ? { ...((parsed.data as Record<string, unknown>) ?? {}) }
      : { ...parsed };
  const autoRecord = parseAutoRecordFlag(flags["auto-record"]);
  if (autoRecord !== undefined) base.autoRecord = autoRecord;
  if (flags.name !== undefined) base.name = flags.name.trim();
  if (flags.reason?.trim()) base.reason = flags.reason.trim();
  if (action === "revoke" && base.status === undefined) {
    base.status = "revoked";
  }
  return base;
}

export async function requestIntegrationSettings(
  fetchFn: typeof fetch,
  options: CliOptions,
  subpath: string,
  method: "GET" | "POST" | "PATCH",
  payload?: unknown,
  idempotencyKey?: string,
): Promise<unknown> {
  return sendJsonSubresourceRequest(fetchFn, options, subpath, method, payload, idempotencyKey);
}
