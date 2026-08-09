import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function required(name: string, value: string | undefined) {
  const normalized = value?.trim() ?? "";
  if (!normalized) throw new Error(`${name} is not configured`);
  return normalized;
}

function upstreamConfig() {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("Production-data proxy is development-only");
  }
  const baseUrl = required(
    "NAAI_ERP_DEV_UPSTREAM_BASE_URL",
    process.env.NAAI_ERP_DEV_UPSTREAM_BASE_URL,
  ).replace(/\/$/, "");
  if (new URL(baseUrl).protocol !== "https:") {
    throw new Error("Production-data proxy requires HTTPS");
  }
  return Object.freeze({
    baseUrl,
    token: required("NAAI_ERP_DEV_UPSTREAM_TOKEN", process.env.NAAI_ERP_DEV_UPSTREAM_TOKEN),
    organizationId: required(
      "NAAI_ERP_DEV_UPSTREAM_ORGANIZATION",
      process.env.NAAI_ERP_DEV_UPSTREAM_ORGANIZATION,
    ),
  });
}

function validatePath(path: readonly string[], organizationId: string) {
  const normalized = path.join("/");
  const prefix = `api/v1/organizations/${encodeURIComponent(organizationId)}/`;
  if (!normalized.startsWith(prefix)) throw new Error("Organization path is not allowed");
  return normalized;
}

function validateProjectUpdatePath(path: readonly string[], organizationId: string) {
  const expectedPrefix = ["api", "v1", "organizations", organizationId, "master-data", "projects"];
  const prefixMatches = expectedPrefix.every((segment, index) => path[index] === segment);
  if (!prefixMatches || path.length !== expectedPrefix.length + 1 || !path.at(-1)) {
    throw new Error("Only an existing project record can be updated through this proxy");
  }
  return validatePath(path, organizationId);
}

function validateExpenseCreatePath(path: readonly string[], organizationId: string) {
  const expected = ["api", "v1", "organizations", organizationId, "expenses"];
  if (
    path.length !== expected.length ||
    !expected.every((segment, index) => path[index] === segment)
  ) {
    throw new Error("Only expense creation is allowed through this proxy route");
  }
  return validatePath(path, organizationId);
}

function validateDocumentCreatePath(path: readonly string[], organizationId: string) {
  const expected = ["api", "v1", "organizations", organizationId, "commercial-documents"];
  if (
    path.length !== expected.length ||
    !expected.every((segment, index) => path[index] === segment)
  ) {
    throw new Error("Only commercial-document creation is allowed through this proxy route");
  }
  return validatePath(path, organizationId);
}

async function readOnlyProxy(
  request: Request,
  context: Readonly<{ params: Promise<{ path: string[] }> }>,
) {
  try {
    const config = upstreamConfig();
    const path = validatePath((await context.params).path, config.organizationId);
    const incoming = new URL(request.url);
    const response = await fetch(`${config.baseUrl}/${path}${incoming.search}`, {
      method: request.method,
      headers: {
        accept: request.headers.get("accept") ?? "application/json",
        authorization: `Bearer ${config.token}`,
        "x-correlation-id": request.headers.get("x-correlation-id") ?? crypto.randomUUID(),
      },
      cache: "no-store",
      redirect: "manual",
    });
    const headers = new Headers({ "Cache-Control": "no-store" });
    for (const name of ["content-type", "content-disposition", "etag", "last-modified"]) {
      const value = response.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(request.method === "HEAD" ? null : response.body, {
      status: response.status,
      headers,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "DEV_PRODUCTION_PROXY_UNAVAILABLE",
          message: error instanceof Error ? error.message : "Production-data proxy unavailable",
        },
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export const GET = readOnlyProxy;
export const HEAD = readOnlyProxy;

export async function PATCH(
  request: Request,
  context: Readonly<{ params: Promise<{ path: string[] }> }>,
) {
  try {
    const config = upstreamConfig();
    if (process.env.NAAI_ERP_DEV_ALLOW_PROJECT_UPDATES !== "1") {
      return NextResponse.json(
        {
          error: {
            code: "DEV_PROJECT_UPDATES_DISABLED",
            message: "Project updates are not enabled for this development session",
          },
        },
        { status: 405, headers: { Allow: "GET, HEAD", "Cache-Control": "no-store" } },
      );
    }

    const path = validateProjectUpdatePath((await context.params).path, config.organizationId);
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > 1_000_000) {
      throw new Error("Project update payload is too large");
    }
    const incoming = new URL(request.url);
    const headers = new Headers({
      accept: request.headers.get("accept") ?? "application/json",
      authorization: `Bearer ${config.token}`,
      "content-type": request.headers.get("content-type") ?? "application/json",
      "x-correlation-id": request.headers.get("x-correlation-id") ?? crypto.randomUUID(),
    });
    for (const name of ["idempotency-key", "if-match"]) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    const response = await fetch(`${config.baseUrl}/${path}${incoming.search}`, {
      method: "PATCH",
      headers,
      body,
      cache: "no-store",
      redirect: "manual",
    });
    const responseHeaders = new Headers({ "Cache-Control": "no-store" });
    for (const name of ["content-type", "etag"]) {
      const value = response.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    return new Response(response.body, { status: response.status, headers: responseHeaders });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "DEV_PROJECT_UPDATE_PROXY_UNAVAILABLE",
          message: error instanceof Error ? error.message : "Project update proxy unavailable",
        },
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function POST(
  request: Request,
  context: Readonly<{ params: Promise<{ path: string[] }> }>,
) {
  try {
    const config = upstreamConfig();
    const pathParts = (await context.params).path;
    const isExpenseCreate = pathParts.at(-1) === "expenses";
    const isDocumentCreate = pathParts.at(-1) === "commercial-documents";
    const enabled =
      (isExpenseCreate && process.env.NAAI_ERP_DEV_ALLOW_EXPENSE_CREATES === "1") ||
      (isDocumentCreate && process.env.NAAI_ERP_DEV_ALLOW_DOCUMENT_CREATES === "1");
    if (!enabled) {
      return NextResponse.json(
        {
          error: {
            code: "DEV_RECORD_CREATES_DISABLED",
            message: "This record creation route is not enabled for this development session",
          },
        },
        { status: 405, headers: { Allow: "GET, HEAD", "Cache-Control": "no-store" } },
      );
    }
    const path = isExpenseCreate
      ? validateExpenseCreatePath(pathParts, config.organizationId)
      : validateDocumentCreatePath(pathParts, config.organizationId);
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > 1_000_000) {
      throw new Error("Expense create payload is too large");
    }
    const headers = new Headers({
      accept: request.headers.get("accept") ?? "application/json",
      authorization: `Bearer ${config.token}`,
      "content-type": request.headers.get("content-type") ?? "application/json",
      "x-correlation-id": request.headers.get("x-correlation-id") ?? crypto.randomUUID(),
    });
    const idempotencyKey = request.headers.get("idempotency-key");
    if (idempotencyKey) headers.set("idempotency-key", idempotencyKey);
    const response = await fetch(`${config.baseUrl}/${path}`, {
      method: "POST",
      headers,
      body,
      cache: "no-store",
      redirect: "manual",
    });
    const responseHeaders = new Headers({ "Cache-Control": "no-store" });
    const contentType = response.headers.get("content-type");
    if (contentType) responseHeaders.set("content-type", contentType);
    return new Response(response.body, { status: response.status, headers: responseHeaders });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "DEV_EXPENSE_CREATE_PROXY_UNAVAILABLE",
          message: error instanceof Error ? error.message : "Expense create proxy unavailable",
        },
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
