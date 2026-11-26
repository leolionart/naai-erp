import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import type { CliOptions } from "./client.js";

export type BinaryDownloadResult = {
  content: Uint8Array;
  contentType: string;
  filename?: string;
  sha256?: string;
};

export async function downloadBinaryFromApi(
  fetchFn: typeof fetch,
  url: string,
  token: string,
  accept: string,
): Promise<BinaryDownloadResult> {
  const response = await fetchFn(url, {
    method: "GET",
    headers: {
      authorization: `Bearer ${token.replace(/^Bearer\s+/i, "")}`,
      accept,
      "x-correlation-id": randomUUID(),
    },
  });
  if (!response.ok) throw new Error(await response.text());
  const disposition = response.headers.get("content-disposition");
  const filename = disposition?.match(/filename="?([^";]+)"?/i)?.[1];
  const sha256 = response.headers.get("x-content-sha256") ?? undefined;
  return {
    content: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") ?? "application/octet-stream",
    ...(filename ? { filename } : {}),
    ...(sha256 ? { sha256 } : {}),
  };
}

export function tryResolvePaymentEvidenceRoute(
  options: CliOptions,
  resource: string,
  action: string,
  key?: string,
): { method: "GET" | "PATCH"; path: string } | null {
  if (!options.organizationId) return null;
  const orgBase = `${options.baseUrl}/api/v1/organizations/${encodeURIComponent(options.organizationId)}`;
  if (resource === "payment-evidence-gaps") {
    if (!["get", "list"].includes(action)) {
      throw new Error(`Unsupported payment-evidence-gaps action: ${action}`);
    }
    return { method: "GET", path: `${orgBase}/reports/tax/payment-evidence-gaps` };
  }
  if (resource === "expenses" && action === "update-payment-evidence") {
    if (!key) throw new Error("expenses update-payment-evidence requires --key");
    return {
      method: "PATCH",
      path: `${orgBase}/expenses/${encodeURIComponent(key)}/payment-evidence`,
    };
  }
  if (resource === "commercial-documents" && action === "update-payment-evidence") {
    if (!key) throw new Error("commercial-documents update-payment-evidence requires --key");
    return {
      method: "PATCH",
      path: `${orgBase}/commercial-documents/${encodeURIComponent(key)}/payment-evidence`,
    };
  }
  if (resource === "organization-workflow-policy" && action === "update") {
    return { method: "PATCH", path: `${orgBase}/organization-workflow-policy` };
  }
  return null;
}

export async function writeDownloadedWorkbookOutput(
  output: string,
  file: BinaryDownloadResult,
): Promise<string> {
  await writeFile(output, file.content);
  return `${JSON.stringify({
    output,
    bytes: file.content.byteLength,
    contentType: file.contentType,
    ...(file.filename ? { filename: file.filename } : {}),
    ...(file.sha256 ? { sha256: file.sha256 } : {}),
  })}\n`;
}
