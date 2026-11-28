import { writeFile } from "node:fs/promises";
import type { CliValues } from "./main-cli-options.js";
import type { NaaiErpReadClient } from "./read-client.js";

const STATEMENT_AND_TAX_REPORT_RESOURCES = new Set([
  "financial-statements",
  "financial-statement-drilldown",
  "vat-reconciliation",
  "expense-exceptions",
  "payment-evidence-gaps",
]);

export function validateReportCommandArgs(
  resource: string,
  action: string,
  values: CliValues,
): void {
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
}

export function tryBuildReportResourcePayload(
  resource: string,
  action: string,
  values: CliValues,
): { matched: true; payload: unknown } | { matched: false } {
  if (resource === "reports") {
    return {
      matched: true,
      payload: { from: values.from, to: values.to, accountCode: values.account },
    };
  }
  if (resource === "ar-aging" || resource === "ap-aging") {
    return {
      matched: true,
      payload: {
        asOf: values["as-of"],
        ...(values.party ? { partyId: values.party } : {}),
        ...(values.account ? { accountCode: values.account } : {}),
        ...(values.bucket ? { bucket: values.bucket } : {}),
        ...(values["payment-status"] ? { paymentStatus: values["payment-status"] } : {}),
        ...(values["include-settled"] ? { includeSettled: true } : {}),
        ...(values.cursor ? { cursor: values.cursor } : {}),
        ...(values.limit ? { limit: values.limit } : {}),
      },
    };
  }
  if (resource === "project-profitability") {
    return {
      matched: true,
      payload: {
        ...(values.from ? { startsOn: values.from } : {}),
        ...(values.to ? { endsOn: values.to } : {}),
        ...(values["project-id"] ? { projectId: values["project-id"] } : {}),
        ...(values.party ? { clientId: values.party } : {}),
        ...(values["service-line"] ? { serviceLineCode: values["service-line"] } : {}),
        ...(values["account-owner"] ? { accountOwnerId: values["account-owner"] } : {}),
        ...(values["group-by"] ? { groupBy: values["group-by"] } : {}),
        ...(values["confidence-code"] ? { confidenceCode: values["confidence-code"] } : {}),
      },
    };
  }
  if (STATEMENT_AND_TAX_REPORT_RESOURCES.has(resource)) {
    return {
      matched: true,
      payload: {
        ...(values.from ? { startsOn: values.from } : {}),
        ...(values.to ? { endsOn: values.to } : {}),
        ...(values["as-of"] ? { asOfInstant: values["as-of"] } : {}),
        ...(values.basis ? { basis: values.basis } : {}),
        ...(values.framework ? { framework: values.framework } : {}),
        ...(values["mapping-version-id"] ? { mappingVersionId: values["mapping-version-id"] } : {}),
        ...(values["project-id"] ? { projectId: values["project-id"] } : {}),
        ...(values.party ? { clientId: values.party } : {}),
        ...(values["cost-center"] ? { costCenter: values["cost-center"] } : {}),
        ...(values["service-line"] ? { serviceLine: values["service-line"] } : {}),
        ...(values["line-code"] ? { lineCode: values["line-code"] } : {}),
        ...(values.status ? { state: values.status } : {}),
      },
    };
  }
  if (resource === "financial-source-resolver") {
    return {
      matched: true,
      payload: {
        ...(values["journal-id"] ? { journalId: values["journal-id"] } : {}),
        ...(values["line-number"] ? { lineNumber: values["line-number"] } : {}),
      },
    };
  }
  if (resource === "report-snapshots") {
    return {
      matched: true,
      payload:
        action === "create"
          ? {
              reportKind: values["report-kind"],
              period: {
                ...(values.from ? { startsOn: values.from } : {}),
                ...(values.to ? { endsOn: values.to } : {}),
                asOfDate: values["as-of"],
              },
              ...(values.dimensions ? { dimensions: JSON.parse(values.dimensions) } : {}),
              accountingBasis: values.basis,
              ...(values.framework ? { framework: values.framework } : {}),
              formulaVersions: values["formula-versions"]
                ? JSON.parse(values["formula-versions"])
                : {},
              request: values.request ? JSON.parse(values.request) : {},
            }
          : action === "get" && values["snapshot-version"]
            ? { version: values["snapshot-version"] }
            : undefined,
    };
  }
  if (resource === "accountant-exports") {
    return {
      matched: true,
      payload:
        action === "create"
          ? {
              snapshotId: values["snapshot-id"],
              snapshotVersion: Number(values["snapshot-version"]),
              format: values.format,
              reportKind: values["report-kind"],
            }
          : action === "get" && values["snapshot-version"]
            ? { version: values["snapshot-version"] }
            : undefined,
    };
  }
  if (resource === "executive-metrics") {
    return {
      matched: true,
      payload: {
        ...(values.from ? { startsOn: values.from } : {}),
        ...(values.to ? { endsOn: values.to } : {}),
        ...(values["as-of"] ? { asOfInstant: values["as-of"] } : {}),
        ...(values.framework ? { framework: values.framework } : {}),
        ...(values["project-id"] ? { projectId: values["project-id"] } : {}),
        ...(values.party ? { clientId: values.party } : {}),
        ...(values["cost-center"] ? { costCenter: values["cost-center"] } : {}),
        ...(values["service-line"] ? { serviceLine: values["service-line"] } : {}),
        ...(values["team-id"] ? { teamId: values["team-id"] } : {}),
        ...(values["account-owner"] ? { ownerId: values["account-owner"] } : {}),
      },
    };
  }
  if (resource === "roi-input-facts") {
    return {
      matched: true,
      payload: {
        ...(values["definition-id"] ? { definitionId: values["definition-id"] } : {}),
        ...(values["review-state"] ? { reviewState: values["review-state"] } : {}),
      },
    };
  }
  if (resource === "executive-metric-policies" || resource === "roi-definitions") {
    return {
      matched: true,
      payload: action === "get" && values.version ? { version: values.version } : undefined,
    };
  }
  if (resource === "financial-statement-mappings") {
    return {
      matched: true,
      payload: {
        ...(values.framework ? { framework: values.framework } : {}),
        ...(values.status ? { state: values.status } : {}),
        ...(values["as-of"] ? { effectiveOn: values["as-of"] } : {}),
      },
    };
  }
  if (resource === "performance-comparisons") {
    return {
      matched: true,
      payload: {
        periodId: values["period-id"],
        periodBasis: values["period-basis"],
        actualBasis: values.basis,
        asOfInstant: values["as-of"],
        ...(values["forecast-version-id"]
          ? { forecastVersionId: values["forecast-version-id"] }
          : {}),
        ...(values["team-id"] ? { teamId: values["team-id"] } : {}),
        ...(values["service-line"] ? { serviceLineCode: values["service-line"] } : {}),
        ...(values["account-owner"] ? { ownerId: values["account-owner"] } : {}),
      },
    };
  }
  return { matched: false };
}

export function applyOperatingDashboardPayload(
  resource: string,
  fallbackPayload: unknown,
  values: CliValues,
): unknown {
  if (resource !== "operating-dashboard") return fallbackPayload;
  return {
    ...(values["as-of"] ? { asOf: values["as-of"] } : {}),
    ...(values.from ? { startsOn: values.from } : {}),
    ...(values.to ? { endsOn: values.to } : {}),
    ...(values.limit ? { limit: values.limit } : {}),
  };
}

export async function tryRunAccountantExportDownload(
  client: NaaiErpReadClient,
  resource: string,
  action: string,
  values: CliValues,
): Promise<boolean> {
  if (resource !== "accountant-exports" || action !== "download") return false;
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
  return true;
}
