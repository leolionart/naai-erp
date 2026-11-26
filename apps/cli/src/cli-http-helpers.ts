import { createHash, randomUUID } from "node:crypto";
import type { CliOptions, NaaiErpClient } from "./client.js";

export async function sendJsonSubresourceRequest(
  fetchFn: typeof fetch,
  options: CliOptions,
  subpath: string,
  method: "GET" | "POST",
  payload?: unknown,
  idempotencyKey?: string,
) {
  if (!options.organizationId || !options.token) throw new Error("ORGANIZATION_AND_TOKEN_REQUIRED");
  const base = `${options.baseUrl}/api/v1/organizations/${encodeURIComponent(options.organizationId)}/${subpath}`;
  const query =
    method === "GET" && payload && typeof payload === "object"
      ? new URLSearchParams(payload as Record<string, string>).toString()
      : "";
  const response = await fetchFn(query ? `${base}?${query}` : base, {
    method,
    headers: {
      authorization: `Bearer ${options.token}`,
      "content-type": "application/json",
      "x-correlation-id": randomUUID(),
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
    },
    ...(method === "POST" ? { body: JSON.stringify(payload) } : {}),
  });
  const body: unknown = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(body));
  return body;
}

export async function downloadXlsxAttachment(
  fetchFn: typeof fetch,
  url: string,
  token: string | undefined,
): Promise<{ content: Uint8Array; contentType: string; filename?: string; sha256?: string }> {
  if (!token) throw new Error("ORGANIZATION_AND_TOKEN_REQUIRED");
  const response = await fetchFn(url, {
    method: "GET",
    headers: {
      authorization: `Bearer ${token.replace(/^Bearer\s+/i, "")}`,
      accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
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

export async function executeCrossEnvironmentClone(
  ClientClass: typeof NaaiErpClient,
  input: {
    sourceBaseUrl?: string | undefined;
    sourceOrganization?: string | undefined;
    sourceToken?: string | undefined;
    targetBaseUrl?: string | undefined;
    targetOrganization?: string | undefined;
    targetToken?: string | undefined;
    reason?: string | undefined;
    idempotencyKey?: string | undefined;
    asOf?: string | undefined;
  },
) {
  if (
    !input.sourceBaseUrl ||
    !input.sourceOrganization ||
    !input.sourceToken ||
    !input.targetBaseUrl ||
    !input.targetOrganization ||
    !input.targetToken
  ) {
    throw new Error(
      "portable-data-clone run requires source/target base URL, organization, and token",
    );
  }
  if (!input.reason?.trim() || !input.idempotencyKey) {
    throw new Error("portable-data-clone run requires --reason and --idempotency-key");
  }
  const source = new ClientClass({
    baseUrl: input.sourceBaseUrl,
    organizationId: input.sourceOrganization,
    token: input.sourceToken,
  });
  const target = new ClientClass({
    baseUrl: input.targetBaseUrl,
    organizationId: input.targetOrganization,
    token: input.targetToken,
  });
  const exportResponse = (await source.portableDataRequest(
    "exports",
    "POST",
    { asOf: input.asOf ?? new Date().toISOString().slice(0, 10) },
    `${input.idempotencyKey}:export`,
  )) as { data?: { packageId?: string }; packageId?: string };
  const packageId = exportResponse.data?.packageId ?? exportResponse.packageId;
  if (!packageId) throw new Error("portable-data-clone export response did not include packageId");
  const file = await source.downloadPortableDataPackage(packageId);
  const workbookSha256 = createHash("sha256").update(file.content).digest("hex");
  const restore = await target.portableDataRequest(
    "imports/restore-empty",
    "POST",
    {
      sourceOrganizationId: input.sourceOrganization,
      confirmTargetOrganizationId: input.targetOrganization,
      packageId,
      workbookSha256,
      reason: input.reason.trim(),
      workbookBase64: Buffer.from(file.content).toString("base64"),
      mapSourceActorsToTargetActor: true,
    },
    `${input.idempotencyKey}:restore`,
  );
  return { packageId, workbookSha256, restore };
}
