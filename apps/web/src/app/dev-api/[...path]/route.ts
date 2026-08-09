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
