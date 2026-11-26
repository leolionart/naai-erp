import { randomUUID } from "node:crypto";

export type ExtendedCliRoute = Readonly<{
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;
  includeBody: boolean;
}>;

function toQueryString(payload: unknown): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
  return new URLSearchParams(
    Object.entries(payload as Record<string, unknown>)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([name, value]): [string, string] => [name, String(value)]),
  ).toString();
}

export function resolveExtendedCliRoute(input: {
  baseUrl: string;
  organizationId: string;
  resource: string;
  action: string;
  payload?: unknown;
  key?: string;
}): ExtendedCliRoute | null {
  const orgRoot = `${input.baseUrl}/api/v1/organizations/${encodeURIComponent(input.organizationId)}`;
  const { resource, action, payload, key } = input;

  if (resource === "cit-policy") {
    const base = `${orgRoot}/cit-policy`;
    if (action === "get" || action === "list") {
      const qs = toQueryString(payload);
      return { method: "GET", url: qs ? `${base}?${qs}` : base, includeBody: false };
    }
    if (action === "set" || action === "update") {
      return { method: "PUT", url: base, includeBody: true };
    }
    if (action === "set-tiers") {
      if (!key) throw new Error("cit-policy set-tiers requires --key <effective-from-year>");
      return {
        method: "PUT",
        url: `${base}/rate-tiers/${encodeURIComponent(key)}`,
        includeBody: true,
      };
    }
    throw new Error(`Unsupported cit-policy action: ${action}`);
  }

  if (resource === "estimated-cit") {
    if (action !== "get" && action !== "list") {
      throw new Error(`Unsupported estimated-cit action: ${action}`);
    }
    const base = `${orgRoot}/reports/tax/estimated-cit`;
    const qs = toQueryString(payload);
    return { method: "GET", url: qs ? `${base}?${qs}` : base, includeBody: false };
  }

  if (resource === "owner-custody-migration") {
    if (!["dry-run", "commit"].includes(action)) {
      throw new Error(`Unsupported owner-custody-migration action: ${action}`);
    }
    return {
      method: "POST",
      url: `${orgRoot}/funding-plans/owner-custody-migration/${action}`,
      includeBody: true,
    };
  }

  if (resource === "account-plans") {
    if (!["dry-run", "commit"].includes(action)) {
      throw new Error(`Unsupported account-plans action: ${action}`);
    }
    return { method: "POST", url: `${orgRoot}/account-plans/${action}`, includeBody: true };
  }

  if (resource === "funding-plans") {
    const base = `${orgRoot}/funding-plans`;
    if (action === "export" || action === "unlinked") {
      const qs = toQueryString(payload);
      return {
        method: "GET",
        url: qs ? `${base}/${action}?${qs}` : `${base}/${action}`,
        includeBody: false,
      };
    }
    if (action === "dry-run" || action === "commit") {
      return { method: "POST", url: `${base}/${action}`, includeBody: true };
    }
    throw new Error(`Unsupported funding-plans action: ${action}`);
  }

  if (resource === "funding-rules") {
    const base = `${orgRoot}/funding-rules`;
    if (action === "list" || action === "get-default") {
      return { method: "GET", url: base, includeBody: false };
    }
    if (action === "set-default") {
      return { method: "PUT", url: `${base}/default`, includeBody: true };
    }
    if (action === "test") {
      return { method: "POST", url: `${base}/test`, includeBody: true };
    }
    if (action === "create") {
      return { method: "POST", url: base, includeBody: true };
    }
    if (action === "update" || action === "delete") {
      if (!key) throw new Error(`funding-rules ${action} requires --key`);
      return {
        method: action === "delete" ? "DELETE" : "PATCH",
        url: `${base}/${encodeURIComponent(key)}`,
        includeBody: action !== "delete",
      };
    }
    throw new Error(`Unsupported funding-rules action: ${action}`);
  }

  return null;
}

export async function executeExtendedCliRoute(input: {
  route: ExtendedCliRoute;
  token: string;
  fetchFn: typeof fetch;
  payload?: unknown;
  expectedVersion?: string;
  idempotencyKey?: string;
}): Promise<unknown> {
  const { route, token, fetchFn, payload, expectedVersion, idempotencyKey } = input;
  const response = await fetchFn(route.url, {
    method: route.method,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-correlation-id": randomUUID(),
      ...(route.method !== "GET" ? { "idempotency-key": idempotencyKey ?? randomUUID() } : {}),
      ...(expectedVersion ? { "if-match": expectedVersion } : {}),
    },
    ...(route.method !== "GET" ? { body: JSON.stringify(payload ?? { data: {} }) } : {}),
  });
  const body: unknown = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(body));
  return body;
}
