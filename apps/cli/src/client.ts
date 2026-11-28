import { resolveLegacyRoute } from "./legacy-route.js";
import { randomUUID } from "node:crypto";
import type {
  CreateCustomerReceiptRequest,
  RecordFreelancePayablePaymentRequest,
  RecordOwnerFundingRequest,
} from "@naai-erp/contracts";
import { executeExtendedCliRoute, resolveExtendedCliRoute } from "./cit-client.js";
import {
  downloadXlsxAttachment,
  jsonOrThrow,
  sendJsonSubresourceRequest,
} from "./cli-http-helpers.js";
import { isOwnerFundingResource, requestOwnerFunding } from "./owner-funding-cli.js";
import {
  downloadBinaryFromApi,
  downloadOrgAccountingExport,
  executePaymentEvidenceRoute,
  tryResolvePaymentEvidenceRoute,
  type BinaryDownloadResult,
} from "./payment-evidence-cli.js";
import { requestIntegrationSettings } from "./integration-sources-cli.js";

export type CliOptions = Readonly<{
  baseUrl: string;
  organizationId?: string;
  token?: string;
}>;

export class NaaiErpClient {
  async listProjectFreelancePayables(filters: Readonly<Record<string, string>> = {}) {
    return this.projectFreelancePayableRequest("", "GET", filters);
  }
  async getProjectFreelancePayable(id: string) {
    return this.projectFreelancePayableRequest(encodeURIComponent(id), "GET");
  }
  async payProjectFreelancePayable(
    id: string,
    input: RecordFreelancePayablePaymentRequest,
    idempotencyKey: string,
  ) {
    return this.projectFreelancePayableRequest(
      `${encodeURIComponent(id)}/pay`,
      "POST",
      input,
      idempotencyKey,
    );
  }
  private async projectFreelancePayableRequest(
    path: string,
    method: "GET" | "POST",
    payload?: unknown,
    idempotencyKey?: string,
  ) {
    return sendJsonSubresourceRequest(
      this.fetchFn,
      this.options,
      `project-freelance-payables${path ? `/${path}` : ""}`,
      method,
      payload,
      idempotencyKey,
    );
  }
  async createCustomerReceipt(
    input: CreateCustomerReceiptRequest,
    idempotencyKey: string,
  ): Promise<unknown> {
    return sendJsonSubresourceRequest(
      this.fetchFn,
      this.options,
      "customer-receipts",
      "POST",
      input,
      idempotencyKey,
    );
  }
  async resetLocalOrganization(
    input: Readonly<{ confirmOrganizationId: string; packageId: string; workbookSha256: string }>,
    idempotencyKey: string,
  ): Promise<unknown> {
    if (!this.options.organizationId || !this.options.token)
      throw new Error("ORGANIZATION_AND_TOKEN_REQUIRED");
    const hostname = new URL(this.options.baseUrl).hostname;
    if (!["localhost", "127.0.0.1", "::1"].includes(hostname))
      throw new Error("LOCAL_RESET_REQUIRES_LOOPBACK_BASE_URL");
    const response = await this.fetchFn(`${this.portableDataBase()}/local-admin/reset`, {
      method: "POST",
      headers: { ...this.portableDataHeaders(idempotencyKey), "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    return jsonOrThrow(response);
  }
  async listOwnerFunding(filters: Readonly<Record<string, string>> = {}): Promise<unknown> {
    return requestOwnerFunding(this.fetchFn, this.options, "owner-funding", "list", filters);
  }
  async listIntegrationSources(): Promise<unknown> {
    return requestIntegrationSettings(this.fetchFn, this.options, "integration-sources", "GET");
  }
  async updateIntegrationSource(
    id: string,
    input: Readonly<Record<string, unknown>>,
    idempotencyKey?: string,
  ): Promise<unknown> {
    return requestIntegrationSettings(
      this.fetchFn,
      this.options,
      `integration-sources/${encodeURIComponent(id)}`,
      "PATCH",
      input,
      idempotencyKey,
    );
  }
  async rotateIntegrationSourceSecret(
    id: string,
    input: Readonly<Record<string, unknown>> = {},
    idempotencyKey?: string,
  ): Promise<unknown> {
    return requestIntegrationSettings(
      this.fetchFn,
      this.options,
      `integration-sources/${encodeURIComponent(id)}/rotate-secret`,
      "POST",
      input,
      idempotencyKey,
    );
  }
  async listApiCredentials(): Promise<unknown> {
    return requestIntegrationSettings(this.fetchFn, this.options, "api-credentials", "GET");
  }
  async createApiCredential(
    input: Readonly<Record<string, unknown>>,
    idempotencyKey?: string,
  ): Promise<unknown> {
    return requestIntegrationSettings(
      this.fetchFn,
      this.options,
      "api-credentials",
      "POST",
      input,
      idempotencyKey,
    );
  }
  async updateApiCredential(
    id: string,
    input: Readonly<Record<string, unknown>>,
    idempotencyKey?: string,
  ): Promise<unknown> {
    return requestIntegrationSettings(
      this.fetchFn,
      this.options,
      `api-credentials/${encodeURIComponent(id)}`,
      "PATCH",
      input,
      idempotencyKey,
    );
  }
  async rotateApiCredential(
    id: string,
    input: Readonly<Record<string, unknown>> = {},
    idempotencyKey?: string,
  ): Promise<unknown> {
    return requestIntegrationSettings(
      this.fetchFn,
      this.options,
      `api-credentials/${encodeURIComponent(id)}/rotate`,
      "POST",
      input,
      idempotencyKey,
    );
  }
  async getOwnerFunding(id: string): Promise<unknown> {
    return requestOwnerFunding(this.fetchFn, this.options, "owner-funding", "get", undefined, id);
  }
  async recordOwnerFunding(
    input: RecordOwnerFundingRequest,
    idempotencyKey: string,
  ): Promise<unknown> {
    return requestOwnerFunding(
      this.fetchFn,
      this.options,
      "owner-funding",
      "record",
      input,
      undefined,
      idempotencyKey,
    );
  }
  async recordOwnerRepayment(
    input: Omit<RecordOwnerFundingRequest, "movementType">,
    idempotencyKey: string,
  ): Promise<unknown> {
    return requestOwnerFunding(
      this.fetchFn,
      this.options,
      "owner-funding",
      "repay",
      { ...input, movementType: "owner_repayment" },
      undefined,
      idempotencyKey,
    );
  }
  async downloadAccountingListExport(
    kind: "sales-invoices" | "purchase-invoices-expenses",
    filters: Readonly<Record<string, string>>,
  ): Promise<BinaryDownloadResult> {
    return downloadOrgAccountingExport(
      this.fetchFn,
      this.options,
      kind,
      filters,
      downloadXlsxAttachment,
    );
  }
  async downloadManagementWorkbook(
    filters: Readonly<{ startsOn: string; endsOn: string }>,
  ): Promise<BinaryDownloadResult> {
    return downloadOrgAccountingExport(
      this.fetchFn,
      this.options,
      "management-workbook",
      filters,
      downloadXlsxAttachment,
    );
  }
  constructor(
    private readonly options: CliOptions,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async getExpenseBreakdownReport(
    dimension: "payee" | "category",
    range: Readonly<{ startsOn: string; endsOn: string }>,
  ): Promise<unknown> {
    return sendJsonSubresourceRequest(
      this.fetchFn,
      this.options,
      `reports/expenses/by-${dimension}`,
      "GET",
      range,
    );
  }

  /** Run the backend's evidence-based funding inference for expense records. */
  async inferExpenseFundingDryRun(reason: string): Promise<unknown> {
    return this.expenseFundingInferenceRequest("dry-run", { reason });
  }

  /** Commit a previously generated funding inference plan. */
  async commitExpenseFundingInference(
    input: Readonly<{ reason: string; planHash: string }>,
    idempotencyKey: string,
  ): Promise<unknown> {
    return this.expenseFundingInferenceRequest("commit", input, idempotencyKey);
  }

  private async expenseFundingInferenceRequest(
    action: "dry-run" | "commit",
    payload: Readonly<{ reason: string; planHash?: string }>,
    idempotencyKey?: string,
  ): Promise<unknown> {
    return sendJsonSubresourceRequest(
      this.fetchFn,
      this.options,
      `expenses/funding-inference/${action}`,
      "POST",
      payload,
      idempotencyKey,
    );
  }

  private portableDataBase() {
    if (!this.options.organizationId || !this.options.token) {
      throw new Error("ORGANIZATION_AND_TOKEN_REQUIRED");
    }
    return `${this.options.baseUrl}/api/v1/organizations/${encodeURIComponent(this.options.organizationId)}/portable-data-packages`;
  }

  private portableDataHeaders(idempotencyKey?: string) {
    if (!this.options.token) throw new Error("ORGANIZATION_AND_TOKEN_REQUIRED");
    return {
      authorization: `Bearer ${this.options.token}`,
      accept: "application/json",
      "x-correlation-id": randomUUID(),
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
    };
  }

  async portableDataRequest(
    path: string,
    method: "GET" | "POST",
    payload?: unknown,
    idempotencyKey?: string,
  ): Promise<unknown> {
    const response = await this.fetchFn(`${this.portableDataBase()}/${path}`, {
      method,
      headers: {
        ...this.portableDataHeaders(
          method === "POST" ? (idempotencyKey ?? randomUUID()) : undefined,
        ),
        ...(method === "POST" ? { "content-type": "application/json" } : {}),
      },
      ...(method === "POST" ? { body: JSON.stringify(payload ?? {}) } : {}),
    });
    return jsonOrThrow(response);
  }

  async uploadPortableWorkbook(
    action: "inventory" | "dry-run",
    filename: string,
    content: Uint8Array,
    idempotencyKey?: string,
  ): Promise<unknown> {
    const form = new FormData();
    form.set(
      "workbook",
      new Blob([content], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      filename,
    );
    const response = await this.fetchFn(`${this.portableDataBase()}/imports/${action}`, {
      method: "POST",
      headers: this.portableDataHeaders(idempotencyKey ?? randomUUID()),
      body: form,
    });
    return jsonOrThrow(response);
  }

  async downloadPortableDataPackage(packageId: string): Promise<BinaryDownloadResult> {
    if (!this.options.token) throw new Error("ORGANIZATION_AND_TOKEN_REQUIRED");
    return downloadBinaryFromApi(
      this.fetchFn,
      `${this.portableDataBase()}/exports/${encodeURIComponent(packageId)}/download`,
      this.options.token,
      "application/json, application/octet-stream",
    );
  }

  async downloadAccountantExport(
    id: string,
    version: string,
  ): Promise<{
    content: Uint8Array;
    contentType: string;
    filename?: string;
  }> {
    if (!this.options.organizationId || !this.options.token) {
      throw new Error("ORGANIZATION_AND_TOKEN_REQUIRED");
    }
    if (!id || !/^[1-9]\d*$/.test(version)) {
      throw new Error("accountant-exports download requires --key and a positive --version");
    }
    return downloadBinaryFromApi(
      this.fetchFn,
      `${this.options.baseUrl}/api/v1/organizations/${encodeURIComponent(this.options.organizationId)}/accountant-exports/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}/download`,
      this.options.token,
      "text/csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/octet-stream",
    );
  }

  request(
    resource: string,
    action: string,
    payload?: unknown,
    key?: string,
    expectedVersion?: string,
    idempotencyKey?: string,
  ): Promise<unknown> {
    const isDiscovery = resource === "discovery" && ["openapi", "capabilities"].includes(action);
    if (isDiscovery) {
      const path = action === "openapi" ? "openapi.json" : "capabilities";
      return this.fetchFn(`${this.options.baseUrl}/api/v1/${path}`, {
        method: "GET",
        headers: {
          accept: "application/json",
          "x-correlation-id": randomUUID(),
          ...(this.options.token
            ? { authorization: `Bearer ${this.options.token.replace(/^Bearer\s+/i, "")}` }
            : {}),
        },
      }).then(async (response) => {
        const body: unknown = await response.json();
        if (!response.ok) throw new Error(JSON.stringify(body));
        return body;
      });
    }
    if (!this.options.organizationId || !this.options.token) {
      throw new Error("ORGANIZATION_AND_TOKEN_REQUIRED");
    }
    const extendedRoute = resolveExtendedCliRoute({
      baseUrl: this.options.baseUrl,
      organizationId: this.options.organizationId,
      resource,
      action,
      payload,
      ...(key !== undefined ? { key } : {}),
    });
    if (extendedRoute) {
      return executeExtendedCliRoute({
        route: extendedRoute,
        token: this.options.token,
        fetchFn: this.fetchFn,
        payload,
        ...(expectedVersion !== undefined ? { expectedVersion } : {}),
        ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
      });
    }
    if (isOwnerFundingResource(resource)) {
      return requestOwnerFunding(
        this.fetchFn,
        this.options,
        resource,
        action,
        payload,
        key,
        idempotencyKey,
      );
    }
    const paymentEvidenceRoute = tryResolvePaymentEvidenceRoute(
      this.options,
      resource,
      action,
      key,
    );
    if (paymentEvidenceRoute) {
      return executePaymentEvidenceRoute({
        route: paymentEvidenceRoute,
        fetchFn: this.fetchFn,
        token: this.options.token,
        payload,
        ...(expectedVersion !== undefined ? { expectedVersion } : {}),
        ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
      });
    }
    const { method, url } = resolveLegacyRoute({
      baseUrl: this.options.baseUrl,
      organizationId: this.options.organizationId,
      resource,
      action,
      payload,
      key,
      expectedVersion,
    });
    const correlationId = randomUUID();
    return this.fetchFn(url, {
      method,
      headers: {
        authorization: `Bearer ${this.options.token}`,
        "content-type": "application/json",
        "x-correlation-id": correlationId,
        ...(method !== "GET" ? { "idempotency-key": idempotencyKey ?? randomUUID() } : {}),
        ...(expectedVersion ? { "if-match": expectedVersion } : {}),
      },
      ...(method !== "GET" ? { body: JSON.stringify(payload ?? { data: {} }) } : {}),
    }).then(async (response) => {
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(JSON.stringify(body));
      return body;
    });
  }
}
