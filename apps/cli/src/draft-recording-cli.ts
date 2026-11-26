import { readFile } from "node:fs/promises";
import type { ExtendedCliRoute } from "./cit-client.js";

export type DraftRecordingCliFlags = Readonly<{
  "dry-run"?: boolean | undefined;
  commit?: boolean | undefined;
  "plan-hash"?: string | undefined;
  reason?: string | undefined;
  data?: string | undefined;
  file?: string | undefined;
  "idempotency-key"?: string | undefined;
}>;

export function resolveDraftRecordingCliRoute(input: {
  baseUrl: string;
  organizationId: string;
  resource: string;
  action: string;
  key?: string;
}): ExtendedCliRoute | null {
  const orgRoot = `${input.baseUrl}/api/v1/organizations/${encodeURIComponent(input.organizationId)}`;
  const { resource, action, key } = input;

  if (resource === "drafts") {
    if (!["record", "dry-run", "commit"].includes(action)) {
      throw new Error(`Unsupported drafts action: ${action}`);
    }
    return {
      method: "POST",
      url: `${orgRoot}/drafts/record`,
      includeBody: true,
    };
  }

  if (resource === "expenses" && action === "record") {
    if (!key) throw new Error("expenses record requires --key <expense-id>");
    return {
      method: "POST",
      url: `${orgRoot}/expenses/${encodeURIComponent(key)}/record`,
      includeBody: true,
    };
  }

  if (resource === "commercial-documents" && action === "record") {
    if (!key) throw new Error("commercial-documents record requires --key <document-id>");
    return {
      method: "POST",
      url: `${orgRoot}/commercial-documents/${encodeURIComponent(key)}/record`,
      includeBody: true,
    };
  }

  return null;
}

export async function buildDraftsRecordCliPayload(
  action: string,
  flags: DraftRecordingCliFlags,
): Promise<Record<string, unknown>> {
  if (!["record", "dry-run", "commit"].includes(action)) {
    throw new Error(`Unsupported drafts action: ${action}`);
  }
  const wantDryRun = action === "dry-run" || Boolean(flags["dry-run"]);
  const wantCommit = action === "commit" || Boolean(flags.commit);
  if ((wantDryRun && wantCommit) || (!wantDryRun && !wantCommit)) {
    throw new Error("drafts record requires exactly one of --dry-run or --commit");
  }
  const planHash = flags["plan-hash"]?.trim();
  if (wantCommit && !planHash) {
    throw new Error("drafts record --commit requires --plan-hash");
  }

  const rawText = flags.data ?? (flags.file ? await readFile(flags.file, "utf8") : undefined);
  let parsed: unknown;
  if (rawText !== undefined) {
    parsed = JSON.parse(rawText);
  }
  const extraObject: Record<string, unknown> = Array.isArray(parsed)
    ? { items: parsed }
    : parsed && typeof parsed === "object"
      ? { ...(parsed as Record<string, unknown>) }
      : {};

  return {
    ...extraObject,
    dryRun: wantDryRun,
    commit: wantCommit,
    ...(planHash ? { planHash } : {}),
    ...(flags.reason?.trim() ? { reason: flags.reason.trim() } : {}),
  };
}
