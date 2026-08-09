import { Inject, Injectable } from "@nestjs/common";
import type { ApiEnvelope, CursorPage, MutationMetadata } from "@naai-erp/contracts";
import { API_VERSION } from "@naai-erp/contracts";
import { PgMasterDataStore } from "./pg-master-data.store.js";
import { MASTER_DATA_RESOURCES } from "./resource-registry.js";
import type { ActorContext, MutationInput } from "./master-data.types.js";

const WRITE_ROLES = new Set(["owner", "finance_admin", "accountant", "integration"]);

@Injectable()
export class MasterDataService {
  constructor(@Inject(PgMasterDataStore) private readonly store: PgMasterDataStore) {}

  resources(): readonly string[] {
    return Object.keys(MASTER_DATA_RESOURCES);
  }

  async authenticate(
    authorization: string | undefined,
    organizationId: string,
    correlationId: string,
  ): Promise<ActorContext> {
    const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token && process.env.NODE_ENV !== "development") throw new Error("AUTH_REQUIRED");
    const effectiveToken = token ?? "dev-token";
    const identity = await this.store.authenticate(effectiveToken, organizationId);
    if (!identity) throw new Error("FORBIDDEN");
    return { organizationId, actorId: identity.actorId, roles: identity.roles, correlationId };
  }

  async list(
    resource: string,
    context: ActorContext,
    cursor: string | undefined,
    limitInput: number,
  ): Promise<ApiEnvelope<CursorPage<Record<string, unknown>>>> {
    const offset = cursor
      ? Number.parseInt(Buffer.from(cursor, "base64url").toString("utf8"), 10)
      : 0;
    const limit = Math.min(Math.max(limitInput || 50, 1), 100);
    if (!Number.isFinite(offset) || offset < 0) throw new Error("VALIDATION_FAILED");
    const rows = await this.store.list(resource, context.organizationId, offset, limit + 1);
    const hasNext = rows.length > limit;
    return {
      apiVersion: API_VERSION,
      requestId: context.correlationId,
      organizationId: context.organizationId,
      data: {
        items: rows.slice(0, limit),
        ...(hasNext
          ? { nextCursor: Buffer.from(String(offset + limit)).toString("base64url") }
          : {}),
      },
    };
  }

  async get(
    resource: string,
    key: string,
    context: ActorContext,
  ): Promise<ApiEnvelope<Record<string, unknown>>> {
    const data = await this.store.get(resource, context.organizationId, key);
    if (!data) throw new Error("RESOURCE_NOT_FOUND");
    const resourceVersion = await this.store.getVersion(resource, context.organizationId, key);
    return {
      apiVersion: API_VERSION,
      requestId: context.correlationId,
      organizationId: context.organizationId,
      data: { ...data, resource_version: resourceVersion },
    };
  }

  async delete(
    resource: string,
    key: string,
    context: ActorContext,
    reason: string | undefined,
    expectedVersion: string | undefined,
    idempotencyKey: string | undefined,
  ): Promise<ApiEnvelope<{ resource: Record<string, unknown>; mutation: MutationMetadata }>> {
    if (!context.roles.some((role) => WRITE_ROLES.has(role))) throw new Error("FORBIDDEN");
    if (resource !== "projects") throw new Error("PROJECT_DELETE_NOT_ALLOWED");
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    if (!expectedVersion) throw new Error("IF_MATCH_REQUIRED");
    if (!reason?.trim()) throw new Error("DELETE_REASON_REQUIRED");
    const result = await this.store.deleteProject(
      context,
      key,
      { expectedVersion, reason: reason.trim() },
      idempotencyKey,
    );
    return {
      apiVersion: API_VERSION,
      requestId: context.correlationId,
      organizationId: context.organizationId,
      data: {
        resource: result.data,
        mutation: {
          resourceVersion: result.resourceVersion,
          auditEventId: result.auditEventId,
          correlationId: context.correlationId,
          idempotencyReplayed: result.idempotencyReplayed,
          nextActions: result.nextActions,
        },
      },
    };
  }

  async mutate(
    action: "create" | "update" | "deactivate",
    resource: string,
    key: string | undefined,
    context: ActorContext,
    input: MutationInput,
    idempotencyKey: string | undefined,
  ): Promise<ApiEnvelope<{ resource: Record<string, unknown>; mutation: MutationMetadata }>> {
    if (!context.roles.some((role) => WRITE_ROLES.has(role))) throw new Error("FORBIDDEN");
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    if (resource === "accounting-workflow-policy") {
      input = { ...input, data: { ...input.data, updated_by: context.actorId } };
    }
    if (
      resource === "purchase-products" &&
      input.data.vat_rate_percent !== undefined &&
      ![8, 10].includes(Number(input.data.vat_rate_percent))
    )
      throw new Error("PURCHASE_PRODUCT_VAT_RATE_INVALID");
    const result = await this.store.mutate(action, resource, context, key, input, idempotencyKey);
    return {
      apiVersion: API_VERSION,
      requestId: context.correlationId,
      organizationId: context.organizationId,
      data: {
        resource: result.data,
        mutation: {
          resourceVersion: result.resourceVersion,
          auditEventId: result.auditEventId,
          correlationId: context.correlationId,
          idempotencyReplayed: result.idempotencyReplayed,
          nextActions: result.nextActions,
        },
      },
    };
  }

  dryRunImport(
    resource: string,
    context: ActorContext,
    rows: readonly Record<string, unknown>[],
  ): ApiEnvelope<{
    valid: boolean;
    rows: readonly { index: number; valid: boolean; errors: readonly string[] }[];
  }> {
    const definition = MASTER_DATA_RESOURCES[resource as keyof typeof MASTER_DATA_RESOURCES];
    if (!definition) throw new Error("RESOURCE_NOT_FOUND");
    const allowed = new Set(definition.writableColumns);
    const results = rows.map((row, index) => {
      const errors = Object.keys(row)
        .filter((field) => !allowed.has(field as never))
        .map((field) => `Unsupported field: ${field}`);
      return { index, valid: errors.length === 0, errors };
    });
    return {
      apiVersion: API_VERSION,
      requestId: context.correlationId,
      organizationId: context.organizationId,
      data: { valid: results.every((row) => row.valid), rows: results },
    };
  }

  async export(
    resource: string,
    context: ActorContext,
  ): Promise<ApiEnvelope<readonly Record<string, unknown>[]>> {
    const rows = await this.store.list(resource, context.organizationId, 0, 10_000);
    return {
      apiVersion: API_VERSION,
      requestId: context.correlationId,
      organizationId: context.organizationId,
      data: rows,
    };
  }
}
