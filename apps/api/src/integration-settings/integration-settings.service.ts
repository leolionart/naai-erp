import { Inject, Injectable } from "@nestjs/common";
import { API_VERSION } from "@naai-erp/contracts";
import { MasterDataService } from "../master-data/master-data.service.js";
import { PgIntegrationSettingsStore } from "./pg-integration-settings.store.js";
import type {
  CreateWebhookSourceInput,
  IntegrationSettingsContext,
  UpdateApiCredentialInput,
  UpdateWebhookSourceInput,
} from "./integration-settings.types.js";

const READ_ROLES = new Set(["owner", "finance_admin", "accountant"]);
const WRITE_ROLES = new Set(["owner", "finance_admin"]);
const VALID_WEBHOOK_STATUSES = new Set(["active", "suspended", "revoked"]);
const ALLOWED_EVENT_SET = new Set([
  "expense.create",
  "purchase_invoice.create",
  "sales_invoice.create",
  "credit_note.create",
]);

@Injectable()
export class IntegrationSettingsService {
  constructor(
    @Inject(PgIntegrationSettingsStore) private readonly store: PgIntegrationSettingsStore,
    @Inject(MasterDataService) private readonly masterData: MasterDataService,
  ) {}

  authenticate(authorization: string | undefined, organizationId: string, correlationId: string) {
    return this.masterData.authenticate(authorization, organizationId, correlationId);
  }

  private envelope(context: IntegrationSettingsContext, data: unknown) {
    return {
      apiVersion: API_VERSION,
      requestId: context.correlationId,
      organizationId: context.organizationId,
      data,
    };
  }

  private assertRead(context: IntegrationSettingsContext) {
    if (!context.roles.some((role) => READ_ROLES.has(role))) {
      throw new Error("FORBIDDEN");
    }
  }

  private assertWrite(context: IntegrationSettingsContext) {
    if (!context.roles.some((role) => WRITE_ROLES.has(role))) {
      throw new Error("FORBIDDEN");
    }
  }

  async listOverview(context: IntegrationSettingsContext) {
    this.assertRead(context);
    return this.envelope(context, await this.store.listOverview(context.organizationId));
  }

  async getWebhookSource(context: IntegrationSettingsContext, id: string) {
    this.assertRead(context);
    const source = await this.store.getWebhookSource(context.organizationId, id);
    if (!source) throw new Error("RESOURCE_NOT_FOUND");
    return this.envelope(context, source);
  }

  async createWebhookSource(
    context: IntegrationSettingsContext,
    input: CreateWebhookSourceInput,
    idempotencyKey?: string,
  ) {
    this.assertWrite(context);
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    if (
      !input ||
      typeof input !== "object" ||
      !input.name?.trim() ||
      !input.actorId?.trim() ||
      !input.secretRef?.trim()
    ) {
      throw new Error("VALIDATION_FAILED");
    }
    if (input.status !== undefined && !VALID_WEBHOOK_STATUSES.has(input.status)) {
      throw new Error("VALIDATION_FAILED");
    }
    if (
      input.allowedEventTypes !== undefined &&
      (!Array.isArray(input.allowedEventTypes) ||
        input.allowedEventTypes.length === 0 ||
        input.allowedEventTypes.some((item) => !ALLOWED_EVENT_SET.has(item)))
    ) {
      throw new Error("VALIDATION_FAILED");
    }
    if (
      input.timestampToleranceSeconds !== undefined &&
      (!Number.isInteger(input.timestampToleranceSeconds) ||
        input.timestampToleranceSeconds < 30 ||
        input.timestampToleranceSeconds > 900)
    ) {
      throw new Error("VALIDATION_FAILED");
    }
    if (
      input.maxAttempts !== undefined &&
      (!Number.isInteger(input.maxAttempts) || input.maxAttempts < 1 || input.maxAttempts > 20)
    ) {
      throw new Error("VALIDATION_FAILED");
    }
    if (input.autoRecord !== undefined && typeof input.autoRecord !== "boolean") {
      throw new Error("VALIDATION_FAILED");
    }
    return this.envelope(
      context,
      await this.store.createWebhookSource(context, input, idempotencyKey),
    );
  }

  async updateWebhookSource(
    context: IntegrationSettingsContext,
    id: string,
    input: UpdateWebhookSourceInput,
    expectedVersion?: string,
    idempotencyKey?: string,
  ) {
    this.assertWrite(context);
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    if (!input || typeof input !== "object") throw new Error("VALIDATION_FAILED");
    const hasMutableField =
      input.name !== undefined ||
      input.actorId !== undefined ||
      input.secretRef !== undefined ||
      input.status !== undefined ||
      input.allowedEventTypes !== undefined ||
      input.timestampToleranceSeconds !== undefined ||
      input.maxAttempts !== undefined ||
      input.autoRecord !== undefined;
    if (!hasMutableField) throw new Error("VALIDATION_FAILED");
    if (input.name !== undefined && !input.name.trim()) throw new Error("VALIDATION_FAILED");
    if (input.actorId !== undefined && !input.actorId.trim()) throw new Error("VALIDATION_FAILED");
    if (input.secretRef !== undefined && !input.secretRef.trim())
      throw new Error("VALIDATION_FAILED");
    if (input.status !== undefined && !VALID_WEBHOOK_STATUSES.has(input.status)) {
      throw new Error("VALIDATION_FAILED");
    }
    if (
      input.allowedEventTypes !== undefined &&
      (!Array.isArray(input.allowedEventTypes) ||
        input.allowedEventTypes.length === 0 ||
        input.allowedEventTypes.some((item) => !ALLOWED_EVENT_SET.has(item)))
    ) {
      throw new Error("VALIDATION_FAILED");
    }
    if (
      input.timestampToleranceSeconds !== undefined &&
      (!Number.isInteger(input.timestampToleranceSeconds) ||
        input.timestampToleranceSeconds < 30 ||
        input.timestampToleranceSeconds > 900)
    ) {
      throw new Error("VALIDATION_FAILED");
    }
    if (
      input.maxAttempts !== undefined &&
      (!Number.isInteger(input.maxAttempts) || input.maxAttempts < 1 || input.maxAttempts > 20)
    ) {
      throw new Error("VALIDATION_FAILED");
    }
    if (input.autoRecord !== undefined && typeof input.autoRecord !== "boolean") {
      throw new Error("VALIDATION_FAILED");
    }
    return this.envelope(
      context,
      await this.store.updateWebhookSource(
        context,
        id,
        input,
        expectedVersion?.trim() || undefined,
        idempotencyKey,
      ),
    );
  }

  async listApiCredentials(context: IntegrationSettingsContext) {
    this.assertRead(context);
    return this.envelope(context, {
      items: await this.store.listApiCredentials(context.organizationId),
    });
  }

  async updateApiCredential(
    context: IntegrationSettingsContext,
    id: string,
    input: UpdateApiCredentialInput,
    expectedVersion?: string,
    idempotencyKey?: string,
  ) {
    this.assertWrite(context);
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    if (!input || typeof input !== "object") throw new Error("VALIDATION_FAILED");
    if (input.autoRecord === undefined && input.name === undefined) {
      throw new Error("VALIDATION_FAILED");
    }
    if (input.autoRecord !== undefined && typeof input.autoRecord !== "boolean") {
      throw new Error("VALIDATION_FAILED");
    }
    if (input.name !== undefined && input.name !== null && typeof input.name !== "string") {
      throw new Error("VALIDATION_FAILED");
    }
    return this.envelope(
      context,
      await this.store.updateApiCredential(
        context,
        id,
        input,
        expectedVersion?.trim() || undefined,
        idempotencyKey,
      ),
    );
  }
}
