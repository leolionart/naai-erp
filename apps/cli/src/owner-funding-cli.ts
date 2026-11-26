import { randomUUID } from "node:crypto";
import type { RecordOwnerFundingRequest } from "@naai-erp/contracts";

export type OwnerFundingCliClientOptions = Readonly<{
  baseUrl: string;
  organizationId?: string;
  token?: string;
}>;

export function isOwnerFundingResource(resource: string): boolean {
  return (
    resource === "owner-funding" ||
    resource === "owner-repayment" ||
    resource === "owner-repayments"
  );
}

export async function requestOwnerFunding(
  fetchFn: typeof fetch,
  options: OwnerFundingCliClientOptions,
  resource: string,
  action: string,
  payload?: unknown,
  key?: string,
  idempotencyKey?: string,
): Promise<unknown> {
  if (!options.organizationId || !options.token) {
    throw new Error("ORGANIZATION_AND_TOKEN_REQUIRED");
  }
  const base = `${options.baseUrl}/api/v1/organizations/${encodeURIComponent(options.organizationId)}/banking/owner-funding`;
  const isRepaymentResource = resource === "owner-repayment" || resource === "owner-repayments";

  if (action === "list") {
    const queryObj: Record<string, unknown> = {
      ...(isRepaymentResource ? { movementType: "owner_repayment" } : {}),
      ...(payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {}),
    };
    const query = new URLSearchParams(
      Object.entries(queryObj)
        .filter(([, value]) => value !== undefined && value !== null && value !== "")
        .map(([k, v]): [string, string] => [k, String(v)]),
    ).toString();
    const url = query ? `${base}?${query}` : base;
    const response = await fetchFn(url, {
      method: "GET",
      headers: {
        authorization: `Bearer ${options.token}`,
        "content-type": "application/json",
        "x-correlation-id": randomUUID(),
      },
    });
    const body: unknown = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(body));
    return body;
  }

  if (action === "get") {
    if (!key) throw new Error(`${resource} get requires --key`);
    const response = await fetchFn(`${base}/${encodeURIComponent(key)}`, {
      method: "GET",
      headers: {
        authorization: `Bearer ${options.token}`,
        "content-type": "application/json",
        "x-correlation-id": randomUUID(),
      },
    });
    const body: unknown = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(body));
    return body;
  }

  if (action === "record" || action === "create" || action === "repay") {
    const rawBody =
      payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
    const forcedRepayment = action === "repay" || isRepaymentResource;
    const requestBody: RecordOwnerFundingRequest | Record<string, unknown> = {
      ...rawBody,
      ...(forcedRepayment && !rawBody.movementType ? { movementType: "owner_repayment" } : {}),
    };
    const response = await fetchFn(base, {
      method: "POST",
      headers: {
        authorization: `Bearer ${options.token}`,
        "content-type": "application/json",
        "x-correlation-id": randomUUID(),
        "idempotency-key": idempotencyKey ?? randomUUID(),
      },
      body: JSON.stringify(requestBody),
    });
    const body: unknown = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(body));
    return body;
  }

  throw new Error(`Unsupported ${resource} action: ${action}`);
}

export function buildOwnerFundingCliPayload(
  action: string,
  values: Readonly<{
    data?: string | undefined;
    "account-id"?: string | undefined;
    "transaction-id"?: string | undefined;
    date?: string | undefined;
    from?: string | undefined;
    to?: string | undefined;
    "amount-minor"?: string | undefined;
    currency?: string | undefined;
    reference?: string | undefined;
    description?: string | undefined;
    reason?: string | undefined;
    "movement-type"?: string | undefined;
  }>,
): Record<string, unknown> | undefined {
  if (values.data) return JSON.parse(values.data) as Record<string, unknown>;
  if (action === "list") {
    return {
      ...(values["movement-type"] ? { movementType: values["movement-type"] } : {}),
      ...(values["account-id"] ? { financialAccountId: values["account-id"] } : {}),
      ...(values.from ? { from: values.from } : {}),
      ...(values.to ? { to: values.to } : {}),
    };
  }
  if (action === "get") return undefined;
  return {
    schemaVersion: 1,
    ...(values["movement-type"] ? { movementType: values["movement-type"] } : {}),
    ...(values["transaction-id"] ? { bankTransactionId: values["transaction-id"] } : {}),
    ...(values["account-id"] ? { financialAccountId: values["account-id"] } : {}),
    ...(values.date ? { bookingDate: values.date } : {}),
    ...(values["amount-minor"] ? { amountMinor: values["amount-minor"] } : {}),
    ...(values.currency ? { currency: values.currency } : {}),
    ...(values.reference ? { reference: values.reference } : {}),
    ...(values.description ? { description: values.description } : {}),
    ...(values.reason ? { reason: values.reason } : {}),
  };
}
