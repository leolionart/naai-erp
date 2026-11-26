import type { ExtendedCliRoute } from "./cit-client.js";

function toQueryString(payload: unknown): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
  return new URLSearchParams(
    Object.entries(payload as Record<string, unknown>)
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .map(([name, value]): [string, string] => [name, String(value)]),
  ).toString();
}

function parsePeriodKey(
  key?: string,
  payload?: unknown,
): { fiscalYear: string; periodNumber: string } {
  if (key && /^\d{4}[-:/]\d{1,2}$/.test(key.trim())) {
    const [fy, pn] = key.trim().split(/[-:/]/);
    return { fiscalYear: fy!, periodNumber: String(Number(pn!)) };
  }
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (obj.fiscalYear !== undefined && obj.periodNumber !== undefined) {
      return {
        fiscalYear: String(obj.fiscalYear),
        periodNumber: String(obj.periodNumber),
      };
    }
  }
  throw new Error(
    "Close checklist requires --key <YYYY:MM> (or fiscalYear and periodNumber in --data)",
  );
}

export function resolvePeriodCloseCliRoute(input: {
  baseUrl: string;
  organizationId: string;
  resource: string;
  action: string;
  payload?: unknown;
  key?: string;
}): ExtendedCliRoute | null {
  const orgRoot = `${input.baseUrl}/api/v1/organizations/${encodeURIComponent(input.organizationId)}`;
  const { resource, action, payload, key } = input;

  if (resource === "fiscal-periods") {
    if (action === "list") {
      const qs = toQueryString(payload);
      const base = `${orgRoot}/fiscal-periods`;
      return { method: "GET", url: qs ? `${base}?${qs}` : base, includeBody: false };
    }
    if (action === "close-checklist" || action === "checklist") {
      const { fiscalYear, periodNumber } = parsePeriodKey(key, payload);
      return {
        method: "GET",
        url: `${orgRoot}/fiscal-periods/${encodeURIComponent(fiscalYear)}/${encodeURIComponent(periodNumber)}/close-checklist`,
        includeBody: false,
      };
    }
    if (action === "checklist-note" || action === "note") {
      const { fiscalYear, periodNumber } = parsePeriodKey(key, payload);
      return {
        method: "POST",
        url: `${orgRoot}/fiscal-periods/${encodeURIComponent(fiscalYear)}/${encodeURIComponent(periodNumber)}/close-checklist/notes`,
        includeBody: true,
      };
    }
    return null;
  }

  if (resource === "close-checklist") {
    if (action === "get" || action === "list") {
      const { fiscalYear, periodNumber } = parsePeriodKey(key, payload);
      return {
        method: "GET",
        url: `${orgRoot}/fiscal-periods/${encodeURIComponent(fiscalYear)}/${encodeURIComponent(periodNumber)}/close-checklist`,
        includeBody: false,
      };
    }
    if (action === "note") {
      const { fiscalYear, periodNumber } = parsePeriodKey(key, payload);
      return {
        method: "POST",
        url: `${orgRoot}/fiscal-periods/${encodeURIComponent(fiscalYear)}/${encodeURIComponent(periodNumber)}/close-checklist/notes`,
        includeBody: true,
      };
    }
    throw new Error(`Unsupported close-checklist action: ${action}`);
  }

  if (resource === "cash-counts") {
    const base = `${orgRoot}/banking/cash-counts`;
    if (action === "list") {
      const qs = toQueryString(payload);
      return { method: "GET", url: qs ? `${base}?${qs}` : base, includeBody: false };
    }
    if (action === "get") {
      if (!key) throw new Error("cash-counts get requires --key <id>");
      return {
        method: "GET",
        url: `${base}/${encodeURIComponent(key)}`,
        includeBody: false,
      };
    }
    if (action === "record" || action === "create") {
      return { method: "POST", url: base, includeBody: true };
    }
    throw new Error(`Unsupported cash-counts action: ${action}`);
  }

  if (resource === "owner-settlements" || resource === "owner-settlement") {
    const base = `${orgRoot}/banking/owner-settlements`;
    if (action === "position" || action === "list" || action === "get") {
      const qs = toQueryString(payload);
      return {
        method: "GET",
        url: qs ? `${base}/position?${qs}` : `${base}/position`,
        includeBody: false,
      };
    }
    if (action === "settle" || action === "execute" || action === "create") {
      return { method: "POST", url: base, includeBody: true };
    }
    throw new Error(`Unsupported ${resource} action: ${action}`);
  }

  return null;
}
