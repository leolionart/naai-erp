import { randomUUID } from "node:crypto";

export type CliOptions = Readonly<{
  baseUrl: string;
  organizationId?: string;
  token?: string;
}>;

export class NaaiErpClient {
  constructor(
    private readonly options: CliOptions,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

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
    const isExpense = resource === "expenses";
    const isEvidence = resource === "evidence";
    const isInboundEvent = resource === "inbound-events";
    const isOutboundEvent = resource === "outbound-events";
    const isOutboundEndpoint = resource === "outbound-endpoints";
    const isOutboundDelivery = resource === "outbound-deliveries";
    const isBankAccount = resource === "bank-accounts";
    const isBankImport = resource === "bank-imports";
    const isBankTransaction = resource === "bank-transactions";
    const isReconciliation = resource === "reconciliations";
    const isInternalTransfer = resource === "internal-transfers";
    const isAging = resource === "ar-aging" || resource === "ap-aging";
    const isStatementSession = resource === "statement-sessions";
    const isStatementException = resource === "statement-exceptions";
    const isWorker = resource === "workers";
    const isTimesheet = resource === "timesheets";
    const isTimesheetAdjustment = resource === "timesheet-adjustments";
    const isCostRate = resource === "cost-rates";
    const isCapacityVersion = resource === "capacity-versions";
    const isTimeSummary = resource === "time-summary";
    const isProjectCost = resource === "project-costs";
    const isProjectCostSource = resource === "project-cost-sources";
    const isDirectCostAllocation = resource === "direct-cost-allocations";
    const isProjectBudget = resource === "project-budgets";
    const isScopeChange = resource === "scope-changes";
    const isRecognitionPolicy = resource === "recognition-policies";
    const isMilestoneAcceptance = resource === "milestone-acceptances";
    const isRecognitionEvent = resource === "revenue-recognition-events";
    const isProjectRevenueAxes = resource === "project-revenue-axes";
    const isOverheadPolicy = resource === "overhead-policies";
    const isOverheadSourcePool = resource === "overhead-source-pools";
    const isOverheadRun = resource === "overhead-runs";
    const isProjectProfitability = resource === "project-profitability";
    const isPlanning = resource === "revenue-targets" || resource === "forecast-versions";
    const isForecastComponent = resource === "forecast-components";
    const isForecastComposition = resource === "forecast-composition";
    const isPerformanceComparison = resource === "performance-comparisons";
    const isPlanningActualFact = resource === "planning-actual-facts";
    const isFinancialStatementMapping = resource === "financial-statement-mappings";
    const isFinancialStatement = resource === "financial-statements";
    const isFinancialStatementDrilldown = resource === "financial-statement-drilldown";
    const isVatReconciliation = resource === "vat-reconciliation";
    const isExpenseException = resource === "expense-exceptions";
    const isExecutiveMetricPolicy = resource === "executive-metric-policies";
    const isRoiDefinition = resource === "roi-definitions";
    const isRoiInputFact = resource === "roi-input-facts";
    const isExecutiveMetric = resource === "executive-metrics";
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
    const base = `${this.options.baseUrl}/api/v1/organizations/${encodeURIComponent(this.options.organizationId)}/${isExecutiveMetric ? "reports/executive-metrics" : isExecutiveMetricPolicy || isRoiDefinition || isRoiInputFact ? resource : isFinancialStatementMapping ? "financial-statement-mappings" : isFinancialStatement || isFinancialStatementDrilldown ? "reports/financial-statements" : isVatReconciliation ? "reports/tax/vat-reconciliation" : isExpenseException ? "reports/tax/expense-exceptions" : isPerformanceComparison ? "reports/performance-comparisons" : isPlanningActualFact ? "planning-actual-facts" : isForecastComponent || isForecastComposition ? `forecast-versions/${encodeURIComponent(forecastKey().forecastId)}` : isProjectProfitability ? "reports/project-profitability" : isPlanning ? resource : isOverheadPolicy ? "overhead-allocation-policies" : isOverheadSourcePool ? "overhead-source-pools" : isOverheadRun ? "overhead-allocation-runs" : isJournal ? "journals" : isPostingRule ? "posting-rules" : isPeriodWorkflow ? "fiscal-periods" : isReport ? "reports" : isOpeningBalance ? "opening-balances" : isCommercialDocument ? "commercial-documents" : isExpense ? "expenses" : isEvidence ? "evidence" : isInboundEvent ? "inbound-events" : isOutboundEvent ? "outbound-events/outbox" : isOutboundEndpoint ? "outbound-events/endpoints" : isOutboundDelivery ? "outbound-events/deliveries" : isBankAccount ? "banking/accounts" : isBankImport ? "banking/imports" : isBankTransaction ? "banking/transactions" : isReconciliation ? "banking/reconciliations" : isInternalTransfer ? "banking/internal-transfers" : isAging ? `reports/${resource}` : isStatementSession || isStatementException ? "banking/statement-sessions" : isWorker ? "time/workers" : isTimesheet || isTimesheetAdjustment ? "time/timesheets" : isCostRate ? "time/cost-rates" : isCapacityVersion ? "time/capacity-versions" : isTimeSummary ? "time/capacity-summary" : isProjectCost ? "project-costs" : isProjectCostSource ? "project-cost-sources/unallocated" : isDirectCostAllocation ? "direct-cost-allocations" : isProjectBudget || isScopeChange || isRecognitionPolicy || isMilestoneAcceptance || isRecognitionEvent ? resource : isProjectRevenueAxes ? "project-revenue-position" : `master-data/${encodeURIComponent(resource)}`}`;
    const method =
      isForecastComponent && action === "delete"
        ? "DELETE"
        : action === "list" ||
            action === "get" ||
            action === "export" ||
            (isBankTransaction && action === "candidates") ||
            (isBankTransaction && action === "transfer-candidates") ||
            isReport ||
            isPerformanceComparison ||
            isFinancialStatement ||
            isFinancialStatementDrilldown ||
            isVatReconciliation ||
            isExpenseException ||
            isExecutiveMetric
          ? "GET"
          : action === "update"
            ? "PATCH"
            : "POST";
    const path = isExecutiveMetric
      ? action === "get" || action === "list"
        ? base
        : `${base}/${encodeURIComponent(action)}`
      : isExecutiveMetricPolicy || isRoiDefinition
        ? action === "approve"
          ? (() => {
              if (!key || !expectedVersion || !/^\d+$/.test(expectedVersion)) {
                throw new Error(`${resource} approve requires --key and a positive --version`);
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
                if (!key) throw new Error("roi-input-facts review requires --key");
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
                    : isPlanningActualFact && action === "backfill"
                      ? `${base}/backfill`
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
                          : action === "list"
                            ? base
                            : action === "get" || action === "update"
                              ? isProjectProfitability
                                ? `${base}/projects/${encodeURIComponent(key ?? "")}`
                                : `${base}/${key}`
                              : isStatementException && action === "create"
                                ? `${base}/${encodeURIComponent(key ?? "")}/exceptions`
                                : isStatementException &&
                                    ["approve", "resolve", "reject"].includes(action)
                                  ? (() => {
                                      const [sessionId, exceptionId, extra] = (key ?? "").split(
                                        "/",
                                      );
                                      if (!sessionId || !exceptionId || extra) {
                                        throw new Error(
                                          "Statement exception key must be <session-id>/<exception-id>",
                                        );
                                      }
                                      return `${base}/${encodeURIComponent(sessionId)}/exceptions/${encodeURIComponent(exceptionId)}/${action}`;
                                    })()
                                  : isFinancialStatementMapping && action === "approve"
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
                                    : (isOverheadPolicy || isOverheadRun) &&
                                        ["submit", "approve", "reject", "post", "reverse"].includes(
                                          action,
                                        )
                                      ? `${base}/${key}/${action}`
                                      : isPlanning && ["publish", "supersede"].includes(action)
                                        ? `${base}/${key}/${action}`
                                        : isStatementSession && ["review", "close"].includes(action)
                                          ? `${base}/${key}/${action}`
                                          : (isProjectBudget || isScopeChange) &&
                                              ["submit", "approve", "reject"].includes(action)
                                            ? `${base}/${key}/${action}`
                                            : isRecognitionPolicy &&
                                                ["approve", "retire"].includes(action)
                                              ? `${base}/${key}/${action}`
                                              : isMilestoneAcceptance &&
                                                  ["accept", "dispute", "reject"].includes(action)
                                                ? `${base}/${key}/${action}`
                                                : isRecognitionEvent &&
                                                    [
                                                      "submit",
                                                      "approve",
                                                      "post",
                                                      "reverse",
                                                    ].includes(action)
                                                  ? `${base}/${key}/${action}`
                                                  : isTimesheetAdjustment && action === "create"
                                                    ? `${base}/${encodeURIComponent(key ?? "")}/adjustments`
                                                    : isTimesheetAdjustment &&
                                                        ["submit", "approve"].includes(action)
                                                      ? (() => {
                                                          const [timesheetId, adjustmentId, extra] =
                                                            (key ?? "").split("/");
                                                          if (
                                                            !timesheetId ||
                                                            !adjustmentId ||
                                                            extra
                                                          ) {
                                                            throw new Error(
                                                              "Timesheet adjustment key must be <timesheet-id>/<adjustment-id>",
                                                            );
                                                          }
                                                          return `${base}/${encodeURIComponent(timesheetId)}/adjustments/${encodeURIComponent(adjustmentId)}/${action}`;
                                                        })()
                                                      : isTimesheet &&
                                                          [
                                                            "submit",
                                                            "approve",
                                                            "reject",
                                                            "revise",
                                                            "lock",
                                                            "mark-billed",
                                                          ].includes(action)
                                                        ? `${base}/${key}/${action}`
                                                        : isCostRate &&
                                                            ["approve", "retire"].includes(action)
                                                          ? `${base}/${key}/${action}`
                                                          : isWorker && action === "deactivate"
                                                            ? `${base}/${key}/deactivate`
                                                            : isDirectCostAllocation &&
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
                                                                                  ].includes(action)
                                                                                ? `${base}/${key}/${action}`
                                                                                : isInboundEvent &&
                                                                                    action ===
                                                                                      "replay"
                                                                                  ? `${base}/${key}/replay`
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
                                                                                        : isOpeningBalance &&
                                                                                            action ===
                                                                                              "dry-run"
                                                                                          ? `${base}/dry-run`
                                                                                          : isPeriodWorkflow
                                                                                            ? `${base}/${action}`
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
        isWorker ||
        isTimesheet ||
        isCostRate ||
        isCapacityVersion ||
        isTimeSummary ||
        isProjectCost ||
        isProjectCostSource ||
        isDirectCostAllocation ||
        isProjectBudget ||
        isScopeChange ||
        isRecognitionPolicy ||
        isMilestoneAcceptance ||
        isRecognitionEvent ||
        isProjectRevenueAxes ||
        isProjectProfitability ||
        isPlanning ||
        isForecastComponent ||
        isForecastComposition ||
        isPerformanceComparison ||
        isPlanningActualFact ||
        isFinancialStatementMapping ||
        isFinancialStatement ||
        isFinancialStatementDrilldown ||
        isVatReconciliation ||
        isExpenseException ||
        isExecutiveMetricPolicy ||
        isRoiDefinition ||
        isRoiInputFact ||
        isExecutiveMetric) &&
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
