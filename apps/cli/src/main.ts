import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { NaaiErpClient } from "./client.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    organization: { type: "string" },
    "base-url": {
      type: "string",
      default: process.env.NAAI_ERP_BASE_URL ?? "http://localhost:3001",
    },
    data: { type: "string" },
    key: { type: "string" },
    version: { type: "string" },
    "idempotency-key": { type: "string" },
    from: { type: "string" },
    to: { type: "string" },
    account: { type: "string" },
    "as-of": { type: "string" },
    party: { type: "string" },
    bucket: { type: "string" },
    "payment-status": { type: "string" },
    "include-settled": { type: "boolean", default: false },
    cursor: { type: "string" },
    limit: { type: "string" },
    status: { type: "string" },
    "worker-id": { type: "string" },
    "project-id": { type: "string" },
    billable: { type: "boolean" },
    classification: { type: "string" },
    basis: { type: "string" },
    "cost-class": { type: "string" },
    "service-line": { type: "string" },
    "account-owner": { type: "string" },
    "group-by": { type: "string" },
    "confidence-code": { type: "string" },
    "period-id": { type: "string" },
    "period-basis": { type: "string" },
    "forecast-version-id": { type: "string" },
    "team-id": { type: "string" },
    disposition: { type: "string" },
    "account-id": { type: "string" },
    framework: { type: "string" },
    "mapping-version-id": { type: "string" },
    "definition-id": { type: "string" },
    "review-state": { type: "string" },
    "line-code": { type: "string" },
    "cost-center": { type: "string" },
    file: { type: "string" },
    adapter: { type: "string" },
    "adapter-version": { type: "string" },
    mapping: { type: "string" },
    human: { type: "boolean", default: false },
  },
});

const [resource, action = "list"] = positionals;
const organizationId = values.organization ?? process.env.NAAI_ERP_ORGANIZATION;
const token = process.env.NAAI_ERP_TOKEN;
const discovery = resource === "discovery" && ["openapi", "capabilities"].includes(action);
if (!resource || (!discovery && (!organizationId || !token))) {
  process.stderr.write(
    JSON.stringify({
      error:
        "resource, and for organization-scoped commands --organization/NAAI_ERP_ORGANIZATION plus NAAI_ERP_TOKEN, are required",
    }) + "\n",
  );
  process.exitCode = 2;
} else {
  const client = new NaaiErpClient({
    baseUrl: values["base-url"]!,
    ...(organizationId ? { organizationId } : {}),
    ...(token ? { token } : {}),
  });
  try {
    const bankAccountId = values["account-id"] ?? values.key;
    const bankAdapterVersion = Number.parseInt(values["adapter-version"] ?? "1", 10);
    if (resource === "bank-imports" && values.file) {
      if (!bankAccountId) throw new Error("--account-id or --key is required for bank imports");
      if (!Number.isInteger(bankAdapterVersion) || bankAdapterVersion < 1) {
        throw new Error("--adapter-version must be a positive integer");
      }
    }
    const payload = values.data
      ? JSON.parse(values.data)
      : resource === "bank-imports" && values.file
        ? {
            schemaVersion: 1,
            financialAccountId: bankAccountId,
            adapterId: values.adapter ?? "generic-csv",
            adapterVersion: bankAdapterVersion,
            filename: basename(values.file),
            csvText: await readFile(values.file, "utf8"),
            ...(values.mapping ? { columnMapping: JSON.parse(values.mapping) } : {}),
          }
        : resource === "reports"
          ? { from: values.from, to: values.to, accountCode: values.account }
          : resource === "ar-aging" || resource === "ap-aging"
            ? {
                asOf: values["as-of"],
                ...(values.party ? { partyId: values.party } : {}),
                ...(values.account ? { accountCode: values.account } : {}),
                ...(values.bucket ? { bucket: values.bucket } : {}),
                ...(values["payment-status"] ? { paymentStatus: values["payment-status"] } : {}),
                ...(values["include-settled"] ? { includeSettled: true } : {}),
                ...(values.cursor ? { cursor: values.cursor } : {}),
                ...(values.limit ? { limit: values.limit } : {}),
              }
            : resource === "statement-sessions"
              ? {
                  ...(values["account-id"] ? { financialAccountId: values["account-id"] } : {}),
                  ...(values.from ? { periodStart: values.from } : {}),
                  ...(values.to ? { periodEnd: values.to } : {}),
                  ...(values.status ? { state: values.status } : {}),
                  ...(values.cursor ? { cursor: values.cursor } : {}),
                  ...(values.limit ? { limit: values.limit } : {}),
                }
              : [
                    "workers",
                    "timesheets",
                    "cost-rates",
                    "capacity-versions",
                    "time-summary",
                  ].includes(resource)
                ? {
                    ...(values["worker-id"] ? { workerId: values["worker-id"] } : {}),
                    ...(values["project-id"] ? { projectId: values["project-id"] } : {}),
                    ...(values.from ? { from: values.from } : {}),
                    ...(values.to ? { to: values.to } : {}),
                    ...(values.status ? { state: values.status } : {}),
                    ...(values.billable !== undefined ? { billable: values.billable } : {}),
                    ...(values.classification ? { workClassification: values.classification } : {}),
                    ...(values.cursor ? { cursor: values.cursor } : {}),
                    ...(values.limit ? { limit: values.limit } : {}),
                  }
                : ["project-costs", "project-cost-sources", "direct-cost-allocations"].includes(
                      resource,
                    )
                  ? {
                      ...(values["project-id"] ? { projectId: values["project-id"] } : {}),
                      ...(values.basis ? { basis: values.basis } : {}),
                      ...(values["cost-class"] ? { costClass: values["cost-class"] } : {}),
                      ...(values.disposition ? { disposition: values.disposition } : {}),
                      ...(values.status ? { state: values.status } : {}),
                      ...(values.from ? { from: values.from } : {}),
                      ...(values.to ? { to: values.to } : {}),
                      ...(values.cursor ? { cursor: values.cursor } : {}),
                      ...(values.limit ? { limit: values.limit } : {}),
                    }
                  : [
                        "project-budgets",
                        "scope-changes",
                        "recognition-policies",
                        "milestone-acceptances",
                        "revenue-recognition-events",
                        "project-revenue-axes",
                      ].includes(resource)
                    ? {
                        ...(values["project-id"] ? { projectId: values["project-id"] } : {}),
                        ...(values["as-of"] ? { asOf: values["as-of"] } : {}),
                        ...(values.status ? { state: values.status } : {}),
                        ...(values.from ? { from: values.from } : {}),
                        ...(values.to ? { to: values.to } : {}),
                      }
                    : ["overhead-policies", "overhead-source-pools", "overhead-runs"].includes(
                          resource,
                        )
                      ? {
                          ...(values.from ? { periodStart: values.from } : {}),
                          ...(values.to ? { periodEnd: values.to } : {}),
                          ...(values.status ? { state: values.status } : {}),
                        }
                      : resource === "project-profitability"
                        ? {
                            ...(values.from ? { startsOn: values.from } : {}),
                            ...(values.to ? { endsOn: values.to } : {}),
                            ...(values["project-id"] ? { projectId: values["project-id"] } : {}),
                            ...(values.party ? { clientId: values.party } : {}),
                            ...(values["service-line"]
                              ? { serviceLineCode: values["service-line"] }
                              : {}),
                            ...(values["account-owner"]
                              ? { accountOwnerId: values["account-owner"] }
                              : {}),
                            ...(values["group-by"] ? { groupBy: values["group-by"] } : {}),
                            ...(values["confidence-code"]
                              ? { confidenceCode: values["confidence-code"] }
                              : {}),
                          }
                        : [
                              "financial-statements",
                              "financial-statement-drilldown",
                              "vat-reconciliation",
                              "expense-exceptions",
                            ].includes(resource)
                          ? {
                              ...(values.from ? { startsOn: values.from } : {}),
                              ...(values.to ? { endsOn: values.to } : {}),
                              ...(values["as-of"] ? { asOfInstant: values["as-of"] } : {}),
                              ...(values.basis ? { basis: values.basis } : {}),
                              ...(values.framework ? { framework: values.framework } : {}),
                              ...(values["mapping-version-id"]
                                ? { mappingVersionId: values["mapping-version-id"] }
                                : {}),
                              ...(values["project-id"] ? { projectId: values["project-id"] } : {}),
                              ...(values.party ? { clientId: values.party } : {}),
                              ...(values["cost-center"]
                                ? { costCenter: values["cost-center"] }
                                : {}),
                              ...(values["service-line"]
                                ? { serviceLine: values["service-line"] }
                                : {}),
                              ...(values["line-code"] ? { lineCode: values["line-code"] } : {}),
                              ...(values.status ? { state: values.status } : {}),
                            }
                          : resource === "executive-metrics"
                            ? {
                                ...(values.from ? { startsOn: values.from } : {}),
                                ...(values.to ? { endsOn: values.to } : {}),
                                ...(values["as-of"] ? { asOfInstant: values["as-of"] } : {}),
                                ...(values.framework ? { framework: values.framework } : {}),
                                ...(values["project-id"]
                                  ? { projectId: values["project-id"] }
                                  : {}),
                                ...(values.party ? { clientId: values.party } : {}),
                                ...(values["cost-center"]
                                  ? { costCenter: values["cost-center"] }
                                  : {}),
                                ...(values["service-line"]
                                  ? { serviceLine: values["service-line"] }
                                  : {}),
                                ...(values["team-id"] ? { teamId: values["team-id"] } : {}),
                                ...(values["account-owner"]
                                  ? { ownerId: values["account-owner"] }
                                  : {}),
                              }
                            : resource === "roi-input-facts"
                              ? {
                                  ...(values["definition-id"]
                                    ? { definitionId: values["definition-id"] }
                                    : {}),
                                  ...(values["review-state"]
                                    ? { reviewState: values["review-state"] }
                                    : {}),
                                }
                              : resource === "executive-metric-policies" ||
                                  resource === "roi-definitions"
                                ? action === "get" && values.version
                                  ? { version: values.version }
                                  : undefined
                                : resource === "financial-statement-mappings"
                                  ? {
                                      ...(values.framework ? { framework: values.framework } : {}),
                                      ...(values.status ? { state: values.status } : {}),
                                      ...(values["as-of"] ? { effectiveOn: values["as-of"] } : {}),
                                    }
                                  : resource === "performance-comparisons"
                                    ? {
                                        periodId: values["period-id"],
                                        periodBasis: values["period-basis"],
                                        actualBasis: values.basis,
                                        asOfInstant: values["as-of"],
                                        ...(values["forecast-version-id"]
                                          ? { forecastVersionId: values["forecast-version-id"] }
                                          : {}),
                                        ...(values["team-id"] ? { teamId: values["team-id"] } : {}),
                                        ...(values["service-line"]
                                          ? { serviceLineCode: values["service-line"] }
                                          : {}),
                                        ...(values["account-owner"]
                                          ? { ownerId: values["account-owner"] }
                                          : {}),
                                      }
                                    : resource.startsWith("bank-")
                                      ? {
                                          ...(values["account-id"]
                                            ? { financialAccountId: values["account-id"] }
                                            : {}),
                                          ...(values.from ? { from: values.from } : {}),
                                          ...(values.to ? { to: values.to } : {}),
                                        }
                                      : undefined;
    const result = await client.request(
      resource,
      action,
      payload,
      values.key,
      values.version,
      values["idempotency-key"],
    );
    process.stdout.write(
      values.human ? `${JSON.stringify(result, null, 2)}\n` : `${JSON.stringify(result)}\n`,
    );
  } catch (error) {
    process.stderr.write(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown CLI error" }) +
        "\n",
    );
    process.exitCode = 1;
  }
}
