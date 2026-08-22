import { randomUUID } from "node:crypto";
import type {
  CreateCustomerReceiptRequest,
  RecordFreelancePayablePaymentRequest,
} from "@naai-erp/contracts";

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
    if (!this.options.organizationId || !this.options.token)
      throw new Error("ORGANIZATION_AND_TOKEN_REQUIRED");
    const base = `${this.options.baseUrl}/api/v1/organizations/${encodeURIComponent(this.options.organizationId)}/project-freelance-payables${path ? `/${path}` : ""}`;
    const query =
      method === "GET" && payload && typeof payload === "object"
        ? new URLSearchParams(payload as Record<string, string>).toString()
        : "";
    const response = await this.fetchFn(query ? `${base}?${query}` : base, {
      method,
      headers: {
        authorization: `Bearer ${this.options.token}`,
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
  async createCustomerReceipt(
    input: CreateCustomerReceiptRequest,
    idempotencyKey: string,
  ): Promise<unknown> {
    if (!this.options.organizationId || !this.options.token)
      throw new Error("ORGANIZATION_AND_TOKEN_REQUIRED");
    const response = await this.fetchFn(
      `${this.options.baseUrl}/api/v1/organizations/${encodeURIComponent(this.options.organizationId)}/customer-receipts`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.options.token}`,
          "content-type": "application/json",
          "x-correlation-id": randomUUID(),
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify(input),
      },
    );
    const body: unknown = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(body));
    return body;
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
    const body: unknown = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(body));
    return body;
  }
  async downloadAccountingListExport(
    kind: "sales-invoices" | "purchase-invoices-expenses",
    filters: Readonly<Record<string, string>>,
  ): Promise<{ content: Uint8Array; contentType: string; filename?: string; sha256?: string }> {
    if (!this.options.organizationId || !this.options.token)
      throw new Error("ORGANIZATION_AND_TOKEN_REQUIRED");
    const query = new URLSearchParams(filters).toString();
    const response = await this.fetchFn(
      `${this.options.baseUrl}/api/v1/organizations/${encodeURIComponent(this.options.organizationId)}/accounting-list-exports/${kind}?${query}`,
      {
        method: "GET",
        headers: {
          authorization: `Bearer ${this.options.token.replace(/^Bearer\s+/i, "")}`,
          accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "x-correlation-id": randomUUID(),
        },
      },
    );
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
  constructor(
    private readonly options: CliOptions,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async getExpenseBreakdownReport(
    dimension: "payee" | "category",
    range: Readonly<{ startsOn: string; endsOn: string }>,
  ): Promise<unknown> {
    if (!this.options.organizationId || !this.options.token)
      throw new Error("ORGANIZATION_AND_TOKEN_REQUIRED");
    const query = new URLSearchParams(range).toString();
    const response = await this.fetchFn(
      `${this.options.baseUrl}/api/v1/organizations/${encodeURIComponent(this.options.organizationId)}/reports/expenses/by-${dimension}?${query}`,
      {
        method: "GET",
        headers: {
          authorization: `Bearer ${this.options.token.replace(/^Bearer\s+/i, "")}`,
          accept: "application/json",
          "x-correlation-id": randomUUID(),
        },
      },
    );
    const body: unknown = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(body));
    return body;
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
    const body: unknown = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(body));
    return body;
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
    const body: unknown = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(body));
    return body;
  }

  async downloadPortableDataPackage(packageId: string): Promise<{
    content: Uint8Array;
    contentType: string;
    filename?: string;
    sha256?: string;
  }> {
    const response = await this.fetchFn(
      `${this.portableDataBase()}/exports/${encodeURIComponent(packageId)}/download`,
      { method: "GET", headers: this.portableDataHeaders() },
    );
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
    const response = await this.fetchFn(
      `${this.options.baseUrl}/api/v1/organizations/${encodeURIComponent(this.options.organizationId)}/accountant-exports/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}/download`,
      {
        method: "GET",
        headers: {
          authorization: `Bearer ${this.options.token}`,
          accept:
            "text/csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/octet-stream",
          "x-correlation-id": randomUUID(),
        },
      },
    );
    if (!response.ok) {
      const body = await response.text();
      throw new Error(body);
    }
    const disposition = response.headers.get("content-disposition");
    const filename = disposition?.match(/filename="?([^";]+)"?/i)?.[1];
    return {
      content: new Uint8Array(await response.arrayBuffer()),
      contentType: response.headers.get("content-type") ?? "application/octet-stream",
      ...(filename ? { filename } : {}),
    };
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
    const isJournal = resource === "journals";
    const isPostingRule = resource === "posting-rules";
    const isPeriodWorkflow = resource === "fiscal-periods" && ["close", "reopen"].includes(action);
    const isReport = resource === "reports" && ["trial-balance", "general-ledger"].includes(action);
    const isOpeningBalance = resource === "opening-balances";
    const isCommercialDocument = resource === "commercial-documents";
    const isQuickPurchaseInvoice = resource === "quick-purchase-invoices";
    const isExpense = resource === "expenses";
    const isCommercialRelationshipBackfill =
      resource === "commercial-document-relationship-backfill";
    const isExpenseRelationshipBackfill = resource === "expense-relationship-backfill";
    const isEvidence = resource === "evidence";
    const isInboundEvent = resource === "inbound-events";
    const isOutboundEvent = resource === "outbound-events";
    const isOutboundEndpoint = resource === "outbound-endpoints";
    const isOutboundDelivery = resource === "outbound-deliveries";
    const isBankAccount = resource === "bank-accounts";
    const isBankImport = resource === "bank-imports";
    const isBankTransaction = resource === "bank-transactions";
    const isOwnerCurrentMovement = resource === "owner-current-movements";
    const isOwnerCashWithdrawal = resource === "owner-cash-withdrawals";
    const isReconciliation = resource === "reconciliations";
    const isInternalTransfer = resource === "internal-transfers";
    const isAging = resource === "ar-aging" || resource === "ap-aging";
    const isStatementSession = resource === "statement-sessions";
    const isStatementException = resource === "statement-exceptions";
    const isProjectBudget = resource === "project-budgets";
    const isScopeChange = resource === "scope-changes";
    const isRecognitionPolicy = resource === "recognition-policies";
    const isMilestoneAcceptance = resource === "milestone-acceptances";
    const isRecognitionEvent = resource === "revenue-recognition-events";
    const isProjectRevenueAxes = resource === "project-revenue-axes";
    const isProjectProfitability = resource === "project-profitability";
    const isOperatingDashboard = resource === "operating-dashboard";
    const isPlanning = resource === "revenue-targets" || resource === "forecast-versions";
    const isForecastComponent = resource === "forecast-components";
    const isForecastComposition = resource === "forecast-composition";
    const isPerformanceComparison = resource === "performance-comparisons";
    const isPlanningActualFact = resource === "planning-actual-facts";
    const isFinancialStatementMapping = resource === "financial-statement-mappings";
    const isFinancialStatement = resource === "financial-statements";
    const isFinancialStatementDrilldown = resource === "financial-statement-drilldown";
    const isFinancialSourceResolver = resource === "financial-source-resolver";
    const isVatReconciliation = resource === "vat-reconciliation";
    const isExpenseException = resource === "expense-exceptions";
    const isExecutiveMetricPolicy = resource === "executive-metric-policies";
    const isOrganizationWorkflowPolicy = resource === "organization-workflow-policy";
    const isRoiDefinition = resource === "roi-definitions";
    const isRoiInputFact = resource === "roi-input-facts";
    const isExecutiveMetric = resource === "executive-metrics";
    const isReportSnapshot = resource === "report-snapshots";
    const isAccountantExport = resource === "accountant-exports";
    const isWorkbookImport = resource === "workbook-imports";
    const isWorkbookReviewRow = resource === "workbook-review-rows";
    const isServicePlan = resource === "service-plans";
    const isCustomerServiceSubscription = resource === "customer-service-subscriptions";
    const isBackgroundActivities =
      resource === "background-activities" || resource === "operational-logs";
    if (isInboundEvent && !["list", "get"].includes(action))
      throw new Error("Inbound events are read-only admin resources");
    const forecastKey = () => {
      const [forecastId, componentId, extra] = (key ?? "").split("/");
      if (
        !forecastId ||
        extra ||
        (isForecastComponent && !["create", "list"].includes(action) && !componentId)
      )
        throw new Error(
          action === "create"
            ? "Forecast component key must be <forecast-id>"
            : "Forecast component key must be <forecast-id>/<component-id>",
        );
      return { forecastId, componentId };
    };
    const base = `${this.options.baseUrl}/api/v1/organizations/${encodeURIComponent(this.options.organizationId)}/${isBackgroundActivities ? "operational-logs" : isServicePlan || isCustomerServiceSubscription ? resource : isOrganizationWorkflowPolicy ? "organization-workflow-policy" : isCommercialRelationshipBackfill || isQuickPurchaseInvoice ? "commercial-documents" : isExpenseRelationshipBackfill ? "expenses" : isWorkbookReviewRow ? "workbook-imports/review-rows" : isReportSnapshot || isAccountantExport || isWorkbookImport ? resource : isExecutiveMetric ? "reports/executive-metrics" : isExecutiveMetricPolicy || isRoiDefinition || isRoiInputFact ? resource : isFinancialStatementMapping ? "financial-statement-mappings" : isFinancialSourceResolver ? "reports/financial-statements/source-resolver" : isFinancialStatement || isFinancialStatementDrilldown ? "reports/financial-statements" : isVatReconciliation ? "reports/tax/vat-reconciliation" : isExpenseException ? "reports/tax/expense-exceptions" : isPerformanceComparison ? "reports/performance-comparisons" : isPlanningActualFact ? "planning-actual-facts" : isForecastComponent || isForecastComposition ? `forecast-versions/${encodeURIComponent(forecastKey().forecastId)}` : isOperatingDashboard ? "reports/operating-dashboard" : isProjectProfitability ? "reports/project-profitability" : isPlanning ? resource : isJournal ? "journals" : isPostingRule ? "posting-rules" : isPeriodWorkflow ? "fiscal-periods" : isReport ? "reports" : isOpeningBalance ? "opening-balances" : isCommercialDocument ? "commercial-documents" : isExpense ? "expenses" : isEvidence ? "evidence" : isInboundEvent ? "inbound-events" : isOutboundEvent ? "outbound-events/outbox" : isOutboundEndpoint ? "outbound-events/endpoints" : isOutboundDelivery ? "outbound-events/deliveries" : isBankAccount ? "banking/accounts" : isBankImport ? "banking/imports" : isBankTransaction ? "banking/transactions" : isOwnerCurrentMovement ? "banking/owner-current-movements" : isOwnerCashWithdrawal ? "banking/owner-cash-withdrawals" : isReconciliation ? "banking/reconciliations" : isInternalTransfer ? "banking/internal-transfers" : isAging ? `reports/${resource}` : isStatementSession || isStatementException ? "banking/statement-sessions" : isProjectBudget || isScopeChange || isRecognitionPolicy || isMilestoneAcceptance || isRecognitionEvent ? resource : isProjectRevenueAxes ? "project-revenue-position" : `master-data/${encodeURIComponent(resource)}`}`;
    const method =
      action === "delete"
        ? "DELETE"
        : action === "list" ||
            ((isCommercialRelationshipBackfill || isExpenseRelationshipBackfill) &&
              action === "inventory") ||
            action === "get" ||
            action === "export" ||
            (isBankTransaction && action === "candidates") ||
            (isBankTransaction && action === "transfer-candidates") ||
            isReport ||
            isPerformanceComparison ||
            isOperatingDashboard ||
            isFinancialStatement ||
            isFinancialStatementDrilldown ||
            isFinancialSourceResolver ||
            isVatReconciliation ||
            isExpenseException ||
            isBackgroundActivities ||
            isExecutiveMetric ||
            ((isServicePlan || isCustomerServiceSubscription) &&
              ["list", "get", "schedule-preview"].includes(action)) ||
            ((isReportSnapshot || isAccountantExport) && ["list", "get"].includes(action))
          ? "GET"
          : action === "update"
            ? "PATCH"
            : "POST";
    const path = isFinancialSourceResolver
      ? base
      : isQuickPurchaseInvoice
        ? action === "create"
          ? `${base}/purchase-invoice-ingestion`
          : (() => {
              throw new Error(`Unsupported ${resource} action: ${action}`);
            })()
        : isCommercialRelationshipBackfill || isExpenseRelationshipBackfill
          ? action === "inventory"
            ? `${base}/relationship-backfill/inventory`
            : ["dry-run", "commit"].includes(action)
              ? `${base}/${encodeURIComponent(key ?? "")}/relationship-backfill/${action}`
              : (() => {
                  throw new Error(`Unsupported ${resource} action: ${action}`);
                })()
          : isReportSnapshot
            ? action === "reproduce"
              ? (() => {
                  if (!key || !expectedVersion || !/^[1-9]\d*$/.test(expectedVersion)) {
                    throw new Error(
                      "report-snapshots reproduce requires --key and a positive --version",
                    );
                  }
                  return `${base}/${encodeURIComponent(key)}/versions/${encodeURIComponent(expectedVersion)}/reproduce`;
                })()
              : action === "get"
                ? (() => {
                    if (!key) throw new Error("report-snapshots get requires --key");
                    return `${base}/${encodeURIComponent(key)}`;
                  })()
                : base
            : isAccountantExport
              ? action === "supersede"
                ? (() => {
                    if (!key || !expectedVersion || !/^[1-9]\d*$/.test(expectedVersion)) {
                      throw new Error(
                        "accountant-exports supersede requires --key and a positive --version",
                      );
                    }
                    return `${base}/${encodeURIComponent(key)}/versions/${encodeURIComponent(expectedVersion)}/supersede`;
                  })()
                : action === "get"
                  ? (() => {
                      if (!key) throw new Error("accountant-exports get requires --key");
                      return `${base}/${encodeURIComponent(key)}`;
                    })()
                  : base
              : isCustomerServiceSubscription && action === "schedule-preview"
                ? (() => {
                    if (!key)
                      throw new Error(
                        "customer-service-subscriptions schedule-preview requires --key",
                      );
                    return `${base}/${encodeURIComponent(key)}/schedule-preview`;
                  })()
                : (isServicePlan || isCustomerServiceSubscription) && action === "get"
                  ? (() => {
                      if (!key) throw new Error(`${resource} get requires --key`);
                      return `${base}/${encodeURIComponent(key)}`;
                    })()
                  : isServicePlan && action === "deactivate"
                    ? (() => {
                        if (!key) throw new Error("service-plans deactivate requires --key");
                        return `${base}/${encodeURIComponent(key)}/deactivate`;
                      })()
                    : isCustomerServiceSubscription &&
                        ["activate", "pause", "resume", "cancel", "expire"].includes(action)
                      ? (() => {
                          if (!key) throw new Error(`${resource} ${action} requires --key`);
                          return `${base}/${encodeURIComponent(key)}/${action}`;
                        })()
                      : isExecutiveMetric
                        ? action === "get" || action === "list"
                          ? base
                          : `${base}/${encodeURIComponent(action)}`
                        : isExecutiveMetricPolicy || isRoiDefinition
                          ? action === "approve"
                            ? (() => {
                                if (!key || !expectedVersion || !/^\d+$/.test(expectedVersion)) {
                                  throw new Error(
                                    `${resource} approve requires --key and a positive --version`,
                                  );
                                }
                                return `${base}/${encodeURIComponent(key)}/versions/${encodeURIComponent(expectedVersion)}/approve`;
                              })()
                            : action === "get"
                              ? (() => {
                                  if (!key) throw new Error(`${resource} get requires --key`);
                                  return `${base}/${encodeURIComponent(key)}`;
                                })()
                              : base
                          : isRoiInputFact
                            ? action === "review"
                              ? (() => {
                                  if (!key)
                                    throw new Error("roi-input-facts review requires --key");
                                  return `${base}/${encodeURIComponent(key)}/review`;
                                })()
                              : base
                            : isFinancialStatement
                              ? `${base}/${encodeURIComponent(action)}`
                              : isFinancialStatementDrilldown
                                ? (() => {
                                    const [statement, lineCode, extra] = (key ?? "").split("/");
                                    if (!statement || !lineCode || extra) {
                                      throw new Error(
                                        "Financial statement drilldown key must be <statement>/<line-code>",
                                      );
                                    }
                                    return `${base}/drilldown`;
                                  })()
                                : isVatReconciliation
                                  ? base
                                  : isExpenseException
                                    ? base
                                    : isPerformanceComparison
                                      ? base
                                      : isForecastComposition
                                        ? `${base}/composition`
                                        : isForecastComponent
                                          ? action === "create"
                                            ? `${base}/components`
                                            : action === "list"
                                              ? `${base}/components`
                                              : ["review", "exclude"].includes(action)
                                                ? `${base}/components/${encodeURIComponent(forecastKey().componentId ?? "")}/${action}`
                                                : `${base}/components/${encodeURIComponent(forecastKey().componentId ?? "")}`
                                          : action === "list" || isOperatingDashboard
                                            ? base
                                            : action === "get" || action === "update"
                                              ? isProjectProfitability
                                                ? `${base}/projects/${encodeURIComponent(key ?? "")}`
                                                : `${base}/${key}`
                                              : isStatementException && action === "create"
                                                ? `${base}/${encodeURIComponent(key ?? "")}/exceptions`
                                                : isStatementException &&
                                                    ["approve", "resolve", "reject"].includes(
                                                      action,
                                                    )
                                                  ? (() => {
                                                      const [sessionId, exceptionId, extra] = (
                                                        key ?? ""
                                                      ).split("/");
                                                      if (!sessionId || !exceptionId || extra) {
                                                        throw new Error(
                                                          "Statement exception key must be <session-id>/<exception-id>",
                                                        );
                                                      }
                                                      return `${base}/${encodeURIComponent(sessionId)}/exceptions/${encodeURIComponent(exceptionId)}/${action}`;
                                                    })()
                                                  : isFinancialStatementMapping &&
                                                      action === "approve"
                                                    ? (() => {
                                                        if (
                                                          !key ||
                                                          !expectedVersion ||
                                                          !/^\d+$/.test(expectedVersion)
                                                        ) {
                                                          throw new Error(
                                                            "Financial statement mapping approve requires --key and a positive --version",
                                                          );
                                                        }
                                                        return `${base}/${encodeURIComponent(key)}/versions/${encodeURIComponent(expectedVersion)}/approve`;
                                                      })()
                                                    : isPlanning &&
                                                        ["publish", "supersede"].includes(action)
                                                      ? `${base}/${key}/${action}`
                                                      : isStatementSession &&
                                                          ["review", "close"].includes(action)
                                                        ? `${base}/${key}/${action}`
                                                        : (isProjectBudget || isScopeChange) &&
                                                            [
                                                              "submit",
                                                              "approve",
                                                              "reject",
                                                            ].includes(action)
                                                          ? `${base}/${key}/${action}`
                                                          : isRecognitionPolicy &&
                                                              ["approve", "retire"].includes(action)
                                                            ? `${base}/${key}/${action}`
                                                            : isMilestoneAcceptance &&
                                                                [
                                                                  "accept",
                                                                  "dispute",
                                                                  "reject",
                                                                ].includes(action)
                                                              ? `${base}/${key}/${action}`
                                                              : isRecognitionEvent &&
                                                                  [
                                                                    "submit",
                                                                    "approve",
                                                                    "post",
                                                                    "reverse",
                                                                  ].includes(action)
                                                                ? `${base}/${key}/${action}`
                                                                : isJournal &&
                                                                    [
                                                                      "approve",
                                                                      "post",
                                                                      "reverse",
                                                                      "repost",
                                                                    ].includes(action)
                                                                  ? `${base}/${key}/${action}`
                                                                  : isPostingRule &&
                                                                      action === "evaluate"
                                                                    ? `${base}/evaluate`
                                                                    : isCommercialDocument &&
                                                                        [
                                                                          "capture",
                                                                          "validate",
                                                                          "verify",
                                                                          "approve",
                                                                          "issue",
                                                                          "post",
                                                                          "cancel",
                                                                        ].includes(action)
                                                                      ? `${base}/${key}/${action}`
                                                                      : isBankImport &&
                                                                          action === "dry-run"
                                                                        ? `${base}/dry-run`
                                                                        : isBankTransaction &&
                                                                            [
                                                                              "ignore",
                                                                              "mark-needs-review",
                                                                            ].includes(action)
                                                                          ? `${base}/${key}/${action}`
                                                                          : isBankTransaction &&
                                                                              [
                                                                                "candidates",
                                                                                "suggest",
                                                                                "match",
                                                                                "reconcile",
                                                                                "unreconcile",
                                                                              ].includes(action)
                                                                            ? `${base}/${key}/${action}`
                                                                            : isBankTransaction &&
                                                                                action ===
                                                                                  "transfer-candidates"
                                                                              ? `${base}/${key}/transfer-candidates`
                                                                              : isInternalTransfer &&
                                                                                  [
                                                                                    "match",
                                                                                    "unmatch",
                                                                                  ].includes(action)
                                                                                ? `${base}/${key}/${action}`
                                                                                : isEvidence &&
                                                                                    [
                                                                                      "review",
                                                                                      "download-url",
                                                                                    ].includes(
                                                                                      action,
                                                                                    )
                                                                                  ? `${base}/${key}/${action}`
                                                                                  : isOutboundEvent &&
                                                                                      action ===
                                                                                        "replay"
                                                                                    ? `${base}/${key}/replay`
                                                                                    : isExpense &&
                                                                                        [
                                                                                          "submit",
                                                                                          "mark-evidence-pending",
                                                                                          "review",
                                                                                          "approve",
                                                                                          "reject",
                                                                                          "post",
                                                                                        ].includes(
                                                                                          action,
                                                                                        )
                                                                                      ? `${base}/${key}/${action}`
                                                                                      : isReport
                                                                                        ? `${base}/${action}`
                                                                                        : isWorkbookImport
                                                                                          ? `${base}/${action}`
                                                                                          : isOpeningBalance &&
                                                                                              action ===
                                                                                                "dry-run"
                                                                                            ? `${base}/dry-run`
                                                                                            : isPeriodWorkflow
                                                                                              ? `${base}/${action}`
                                                                                              : action ===
                                                                                                  "delete"
                                                                                                ? `${base}/${key}`
                                                                                                : action ===
                                                                                                    "deactivate"
                                                                                                  ? `${base}/${key}/deactivate`
                                                                                                  : action ===
                                                                                                      "import"
                                                                                                    ? `${base}/import/dry-run`
                                                                                                    : action ===
                                                                                                        "export"
                                                                                                      ? `${base}/export`
                                                                                                      : base;
    const queryPayload =
      isFinancialStatementDrilldown && payload && typeof payload === "object"
        ? (() => {
            const [statement, lineCode] = (key ?? "").split("/");
            return { ...(payload as Record<string, unknown>), statement, lineCode };
          })()
        : payload;
    const query =
      (isReport ||
        isExpense ||
        isOutboundEvent ||
        isOutboundEndpoint ||
        isOutboundDelivery ||
        isBankAccount ||
        isBankImport ||
        isBankTransaction ||
        isReconciliation ||
        isInternalTransfer ||
        isAging ||
        isStatementSession ||
        isProjectBudget ||
        isScopeChange ||
        isRecognitionPolicy ||
        isMilestoneAcceptance ||
        isRecognitionEvent ||
        isProjectRevenueAxes ||
        isProjectProfitability ||
        isOperatingDashboard ||
        isPlanning ||
        isForecastComponent ||
        isForecastComposition ||
        isPerformanceComparison ||
        isPlanningActualFact ||
        isFinancialStatementMapping ||
        isFinancialStatement ||
        isFinancialStatementDrilldown ||
        isFinancialSourceResolver ||
        isVatReconciliation ||
        isExpenseException ||
        isExecutiveMetricPolicy ||
        isRoiDefinition ||
        isRoiInputFact ||
        isExecutiveMetric ||
        isReportSnapshot ||
        isAccountantExport ||
        isServicePlan ||
        isCustomerServiceSubscription ||
        isBackgroundActivities) &&
      method === "GET" &&
      queryPayload &&
      typeof queryPayload === "object"
        ? new URLSearchParams(
            Object.entries(queryPayload as Record<string, unknown>)
              .filter(([, value]) => value !== undefined && value !== null)
              .map(([name, value]): [string, string] => [name, String(value)]),
          ).toString()
        : "";
    const url = query ? `${path}?${query}` : path;
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
