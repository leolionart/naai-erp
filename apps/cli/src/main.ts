import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { NaaiErpClient } from "./client.js";
import { runWorkbookImport } from "./import-workbooks.js";

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
    through: { type: "string" },
    account: { type: "string" },
    "as-of": { type: "string" },
    party: { type: "string" },
    bucket: { type: "string" },
    "payment-status": { type: "string" },
    "include-settled": { type: "boolean", default: false },
    cursor: { type: "string" },
    limit: { type: "string" },
    status: { type: "string" },
    state: { type: "string" },
    "worker-id": { type: "string" },
    "project-id": { type: "string" },
    "customer-id": { type: "string" },
    "service-plan-id": { type: "string" },
    "active-only": { type: "boolean" },
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
    "journal-id": { type: "string" },
    "line-number": { type: "string" },
    "cost-center": { type: "string" },
    file: { type: "string" },
    adapter: { type: "string" },
    "adapter-version": { type: "string" },
    mapping: { type: "string" },
    "report-kind": { type: "string" },
    "snapshot-id": { type: "string" },
    "snapshot-version": { type: "string" },
    format: { type: "string" },
    output: { type: "string" },
    dimensions: { type: "string" },
    "formula-versions": { type: "string" },
    request: { type: "string" },
    human: { type: "boolean", default: false },
    "project-workbook": { type: "string" },
    "finance-workbook": { type: "string" },
    commit: { type: "boolean", default: false },
    "dry-run-id": { type: "string" },
    "workbook-sha256": { type: "string" },
    "payee-party-id": { type: "string" },
    "invoice-presence": { type: "string" },
    "confirm-organization": { type: "string" },
    "source-organization": { type: "string" },
    reason: { type: "string" },
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
    if (resource === "portable-data-restore") {
      if (
        action !== "empty" ||
        !values.file ||
        !values["source-organization"] ||
        !values["confirm-organization"] ||
        !values.reason ||
        !values["idempotency-key"]
      )
        throw new Error(
          "portable-data-restore empty requires --file, --source-organization, --confirm-organization, --reason, and --idempotency-key",
        );
      const content = await readFile(values.file);
      const workbookSha256 = createHash("sha256").update(content).digest("hex");
      const packageId = values.key;
      if (!packageId) throw new Error("portable-data-restore empty requires --key package ID");
      const result = await client.portableDataRequest(
        "imports/restore-empty",
        "POST",
        {
          sourceOrganizationId: values["source-organization"],
          confirmTargetOrganizationId: values["confirm-organization"],
          packageId,
          workbookSha256,
          reason: values.reason,
          workbookBase64: content.toString("base64"),
          mapSourceActorsToTargetActor: true,
        },
        values["idempotency-key"],
      );
      process.stdout.write(JSON.stringify(result) + "\n");
    } else if (resource === "portable-data-reset") {
      if (
        action !== "local" ||
        !values["confirm-organization"] ||
        !values.key ||
        !values["workbook-sha256"] ||
        !values["idempotency-key"]
      )
        throw new Error(
          "portable-data-reset local requires --confirm-organization, --key, --workbook-sha256, and --idempotency-key",
        );
      if (values["confirm-organization"] !== organizationId)
        throw new Error("--confirm-organization must exactly match the target organization");
      if (!/^[a-fA-F0-9]{64}$/.test(values["workbook-sha256"]))
        throw new Error("--workbook-sha256 must be a 64-character SHA-256");
      const result = await client.resetLocalOrganization(
        {
          confirmOrganizationId: values["confirm-organization"],
          packageId: values.key,
          workbookSha256: values["workbook-sha256"].toLowerCase(),
        },
        values["idempotency-key"],
      );
      process.stdout.write(
        values.human ? `${JSON.stringify(result, null, 2)}\n` : `${JSON.stringify(result)}\n`,
      );
    } else if (resource === "sales-invoice-export" || resource === "purchase-expense-export") {
      if (!["export", "download"].includes(action) || !values.output || !values.from || !values.to)
        throw new Error(`${resource} download requires --from, --to, and explicit --output`);
      const file = await client.downloadAccountingListExport(
        resource === "sales-invoice-export" ? "sales-invoices" : "purchase-invoices-expenses",
        {
          startsOn: values.from,
          endsOn: values.to,
          ...(values.state ? { state: values.state } : {}),
          ...(values.party ? { partyId: values.party } : {}),
          ...(values["payee-party-id"] ? { payeePartyId: values["payee-party-id"] } : {}),
          ...(values["project-id"] ? { projectId: values["project-id"] } : {}),
          ...(values["invoice-presence"] ? { invoicePresence: values["invoice-presence"] } : {}),
        },
      );
      await writeFile(values.output, file.content);
      process.stdout.write(
        JSON.stringify({
          output: values.output,
          bytes: file.content.byteLength,
          contentType: file.contentType,
          ...(file.filename ? { filename: file.filename } : {}),
          ...(file.sha256 ? { sha256: file.sha256 } : {}),
        }) + "\n",
      );
    } else if (resource === "portable-data-export") {
      if (action === "download") {
        if (!values.key || !values.output)
          throw new Error("portable-data-export download requires --key and explicit --output");
        const file = await client.downloadPortableDataPackage(values.key);
        await writeFile(values.output, file.content);
        process.stdout.write(
          JSON.stringify({
            output: values.output,
            bytes: file.content.byteLength,
            contentType: file.contentType,
            ...(file.filename ? { filename: file.filename } : {}),
            ...(file.sha256 ? { sha256: file.sha256 } : {}),
          }) + "\n",
        );
      } else {
        const path =
          action === "export"
            ? "exports"
            : action === "status"
              ? `exports/${encodeURIComponent(values.key ?? "")}`
              : action === "inventory"
                ? `exports/${encodeURIComponent(values.key ?? "")}/inventory`
                : "";
        if (!path) throw new Error(`Unsupported portable-data-export action: ${action}`);
        if (action !== "export" && !values.key)
          throw new Error(`portable-data-export ${action} requires --key`);
        const result = await client.portableDataRequest(
          path,
          action === "export" ? "POST" : "GET",
          action === "export"
            ? values.data
              ? JSON.parse(values.data)
              : { ...(values["as-of"] ? { asOf: values["as-of"] } : {}) }
            : undefined,
          values["idempotency-key"],
        );
        process.stdout.write(
          values.human ? `${JSON.stringify(result, null, 2)}\n` : `${JSON.stringify(result)}\n`,
        );
      }
    } else if (resource === "portable-data-import") {
      if (action === "inventory" || action === "dry-run") {
        if (!values.file) throw new Error(`portable-data-import ${action} requires --file`);
        const result = await client.uploadPortableWorkbook(
          action,
          basename(values.file),
          new Uint8Array(await readFile(values.file)),
          values["idempotency-key"],
        );
        process.stdout.write(
          values.human ? `${JSON.stringify(result, null, 2)}\n` : `${JSON.stringify(result)}\n`,
        );
      } else if (action === "status") {
        if (!values.key) throw new Error("portable-data-import status requires --key");
        const result = await client.portableDataRequest(
          `imports/${encodeURIComponent(values.key)}`,
          "GET",
        );
        process.stdout.write(`${JSON.stringify(result)}\n`);
      } else if (action === "commit") {
        if (!values.key || !values["dry-run-id"] || !values["workbook-sha256"])
          throw new Error(
            "portable-data-import commit requires --key, --dry-run-id, and --workbook-sha256",
          );
        const result = await client.portableDataRequest(
          `imports/${encodeURIComponent(values.key)}/commit`,
          "POST",
          { dryRunId: values["dry-run-id"], workbookSha256: values["workbook-sha256"] },
          values["idempotency-key"],
        );
        process.stdout.write(
          values.human ? `${JSON.stringify(result, null, 2)}\n` : `${JSON.stringify(result)}\n`,
        );
      } else throw new Error(`Unsupported portable-data-import action: ${action}`);
    } else if (resource === "workbook-import") {
      const result = await runWorkbookImport(
        client,
        values["project-workbook"],
        values["finance-workbook"],
        values.commit ?? false,
      );
      process.stdout.write(
        values.human ? `${JSON.stringify(result, null, 2)}\n` : `${JSON.stringify(result)}\n`,
      );
    } else {
      const bankAccountId = values["account-id"] ?? values.key;
      const bankAdapterVersion = Number.parseInt(values["adapter-version"] ?? "1", 10);
      if (resource === "bank-imports" && values.file) {
        if (!bankAccountId) throw new Error("--account-id or --key is required for bank imports");
        if (!Number.isInteger(bankAdapterVersion) || bankAdapterVersion < 1) {
          throw new Error("--adapter-version must be a positive integer");
        }
      }
      if (resource === "report-snapshots" && action === "create" && !values.data) {
        if (
          !values["report-kind"] ||
          !values["as-of"] ||
          !values.basis ||
          !values["formula-versions"] ||
          !values.request
        ) {
          throw new Error(
            "report-snapshots create requires --report-kind, --as-of, --basis, --formula-versions, and --request (or --data)",
          );
        }
      }
      if (
        ["report-snapshots", "accountant-exports"].includes(resource) &&
        values["snapshot-version"] &&
        !/^[1-9]\d*$/.test(values["snapshot-version"])
      ) {
        throw new Error("--snapshot-version must be a positive integer");
      }
      if (resource === "accountant-exports" && action === "create" && !values.data) {
        if (
          !values["snapshot-id"] ||
          !values["snapshot-version"] ||
          !values.format ||
          !values["report-kind"]
        ) {
          throw new Error(
            "accountant-exports create requires --snapshot-id, --snapshot-version, --format, and --report-kind (or --data)",
          );
        }
      }
      if (resource === "financial-source-resolver") {
        if (!values["journal-id"] || !values["line-number"]) {
          throw new Error("financial-source-resolver requires --journal-id and --line-number");
        }
        if (!/^[1-9]\d*$/.test(values["line-number"])) {
          throw new Error("--line-number must be a positive integer");
        }
      }
      if (
        ["commercial-document-relationship-backfill", "expense-relationship-backfill"].includes(
          resource,
        )
      ) {
        if (!["inventory", "dry-run", "commit"].includes(action))
          throw new Error(`${resource} supports only inventory, dry-run, and commit actions`);
        if (action === "inventory") {
          if (values.key || values.version || values.data || values.file)
            throw new Error(`${resource} inventory does not accept record mapping options`);
        } else {
          if (!values.key || !values.version || (!values.data && !values.file))
            throw new Error(
              `${resource} ${action} requires --key, --version, and an explicit JSON mapping via --file or --data`,
            );
          if (action === "commit" && !values["idempotency-key"])
            throw new Error(`${resource} commit requires --idempotency-key`);
        }
      }
      if (
        resource === "customer-service-subscriptions" &&
        action === "schedule-preview" &&
        (!values.key || !values.through)
      )
        throw new Error(
          "customer-service-subscriptions schedule-preview requires --key and --through",
        );
      const payload = values.data
        ? JSON.parse(values.data)
        : ["commercial-document-relationship-backfill", "expense-relationship-backfill"].includes(
              resource,
            ) && values.file
          ? JSON.parse(await readFile(values.file, "utf8"))
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
                    ...(values["payment-status"]
                      ? { paymentStatus: values["payment-status"] }
                      : {}),
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
                        ...(values.classification
                          ? { workClassification: values.classification }
                          : {}),
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
                                ...(values["project-id"]
                                  ? { projectId: values["project-id"] }
                                  : {}),
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
                                  ...(values["line-code"] ? { lineCode: values["line-code"] } : {}),
                                  ...(values.status ? { state: values.status } : {}),
                                }
                              : resource === "financial-source-resolver"
                                ? {
                                    ...(values["journal-id"]
                                      ? { journalId: values["journal-id"] }
                                      : {}),
                                    ...(values["line-number"]
                                      ? { lineNumber: values["line-number"] }
                                      : {}),
                                  }
                                : resource === "report-snapshots"
                                  ? action === "create"
                                    ? {
                                        reportKind: values["report-kind"],
                                        period: {
                                          ...(values.from ? { startsOn: values.from } : {}),
                                          ...(values.to ? { endsOn: values.to } : {}),
                                          asOfDate: values["as-of"],
                                        },
                                        ...(values.dimensions
                                          ? { dimensions: JSON.parse(values.dimensions) }
                                          : {}),
                                        accountingBasis: values.basis,
                                        ...(values.framework
                                          ? { framework: values.framework }
                                          : {}),
                                        formulaVersions: values["formula-versions"]
                                          ? JSON.parse(values["formula-versions"])
                                          : {},
                                        request: values.request ? JSON.parse(values.request) : {},
                                      }
                                    : action === "get" && values["snapshot-version"]
                                      ? { version: values["snapshot-version"] }
                                      : undefined
                                  : resource === "accountant-exports"
                                    ? action === "create"
                                      ? {
                                          snapshotId: values["snapshot-id"],
                                          snapshotVersion: Number(values["snapshot-version"]),
                                          format: values.format,
                                          reportKind: values["report-kind"],
                                        }
                                      : action === "get" && values["snapshot-version"]
                                        ? { version: values["snapshot-version"] }
                                        : undefined
                                    : resource === "executive-metrics"
                                      ? {
                                          ...(values.from ? { startsOn: values.from } : {}),
                                          ...(values.to ? { endsOn: values.to } : {}),
                                          ...(values["as-of"]
                                            ? { asOfInstant: values["as-of"] }
                                            : {}),
                                          ...(values.framework
                                            ? { framework: values.framework }
                                            : {}),
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
                                          ...(values["team-id"]
                                            ? { teamId: values["team-id"] }
                                            : {}),
                                          ...(values["account-owner"]
                                            ? { ownerId: values["account-owner"] }
                                            : {}),
                                        }
                                      : resource === "service-plans"
                                        ? {
                                            ...(values["service-line"]
                                              ? { serviceLineCode: values["service-line"] }
                                              : {}),
                                            ...(values["active-only"] !== undefined
                                              ? { active: values["active-only"] }
                                              : {}),
                                          }
                                        : resource === "customer-service-subscriptions"
                                          ? action === "schedule-preview"
                                            ? {
                                                ...(values.through
                                                  ? { through: values.through }
                                                  : {}),
                                              }
                                            : {
                                                ...(values["customer-id"]
                                                  ? { customerId: values["customer-id"] }
                                                  : {}),
                                                ...(values["service-plan-id"]
                                                  ? { servicePlanId: values["service-plan-id"] }
                                                  : {}),
                                                ...(values["project-id"]
                                                  ? { projectId: values["project-id"] }
                                                  : {}),
                                                ...(values.status
                                                  ? { lifecycle: values.status }
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
                                                    ...(values.framework
                                                      ? { framework: values.framework }
                                                      : {}),
                                                    ...(values.status
                                                      ? { state: values.status }
                                                      : {}),
                                                    ...(values["as-of"]
                                                      ? { effectiveOn: values["as-of"] }
                                                      : {}),
                                                  }
                                                : resource === "performance-comparisons"
                                                  ? {
                                                      periodId: values["period-id"],
                                                      periodBasis: values["period-basis"],
                                                      actualBasis: values.basis,
                                                      asOfInstant: values["as-of"],
                                                      ...(values["forecast-version-id"]
                                                        ? {
                                                            forecastVersionId:
                                                              values["forecast-version-id"],
                                                          }
                                                        : {}),
                                                      ...(values["team-id"]
                                                        ? { teamId: values["team-id"] }
                                                        : {}),
                                                      ...(values["service-line"]
                                                        ? {
                                                            serviceLineCode: values["service-line"],
                                                          }
                                                        : {}),
                                                      ...(values["account-owner"]
                                                        ? { ownerId: values["account-owner"] }
                                                        : {}),
                                                    }
                                                  : resource.startsWith("bank-")
                                                    ? {
                                                        ...(values["account-id"]
                                                          ? {
                                                              financialAccountId:
                                                                values["account-id"],
                                                            }
                                                          : {}),
                                                        ...(values.from
                                                          ? { from: values.from }
                                                          : {}),
                                                        ...(values.to ? { to: values.to } : {}),
                                                      }
                                                    : undefined;
      const requestPayload =
        resource === "operating-dashboard"
          ? {
              ...(values["as-of"] ? { asOf: values["as-of"] } : {}),
              ...(values.from ? { startsOn: values.from } : {}),
              ...(values.to ? { endsOn: values.to } : {}),
              ...(values.limit ? { limit: values.limit } : {}),
            }
          : payload;
      if (resource === "accountant-exports" && action === "download") {
        if (!values.key || !values["snapshot-version"] || !values.output) {
          throw new Error(
            "accountant-exports download requires --key, --snapshot-version, and explicit --output",
          );
        }
        const file = await client.downloadAccountantExport(values.key, values["snapshot-version"]);
        await writeFile(values.output, file.content);
        process.stdout.write(
          `${JSON.stringify({ output: values.output, bytes: file.content.byteLength, contentType: file.contentType, ...(file.filename ? { filename: file.filename } : {}) })}\n`,
        );
        process.exitCode = 0;
      } else {
        const result = await client.request(
          resource,
          action,
          requestPayload,
          values.key,
          values["snapshot-version"] ?? values.version,
          values["idempotency-key"],
        );
        process.stdout.write(
          values.human ? `${JSON.stringify(result, null, 2)}\n` : `${JSON.stringify(result)}\n`,
        );
      }
    }
  } catch (error) {
    process.stderr.write(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown CLI error" }) +
        "\n",
    );
    process.exitCode = 1;
  }
}
