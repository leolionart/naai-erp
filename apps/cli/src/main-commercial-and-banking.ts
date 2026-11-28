import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { CliValues } from "./main-cli-options.js";

const PROJECT_RECOGNITION_RESOURCES = new Set([
  "project-budgets",
  "scope-changes",
  "recognition-policies",
  "milestone-acceptances",
  "revenue-recognition-events",
  "project-revenue-axes",
]);

const RELATIONSHIP_BACKFILL_RESOURCES = new Set([
  "commercial-document-relationship-backfill",
  "expense-relationship-backfill",
]);

export type BankImportArgsContext = Readonly<{
  bankAccountId: string | undefined;
  bankAdapterVersion: number;
}>;

export function validateCommercialAndBankingArgs(
  resource: string,
  action: string,
  values: CliValues,
): BankImportArgsContext {
  if (resource === "quick-purchase-invoices" || resource === "quick-sales-invoices") {
    if (action !== "create" || !values.data || !values["idempotency-key"]) {
      throw new Error(`${resource} create requires --data and --idempotency-key`);
    }
  }
  const bankAccountId = values["account-id"] ?? values.key;
  const bankAdapterVersion = Number.parseInt(values["adapter-version"] ?? "1", 10);
  if (resource === "bank-imports" && values.file) {
    if (!bankAccountId) throw new Error("--account-id or --key is required for bank imports");
    if (!Number.isInteger(bankAdapterVersion) || bankAdapterVersion < 1) {
      throw new Error("--adapter-version must be a positive integer");
    }
  }
  if (RELATIONSHIP_BACKFILL_RESOURCES.has(resource)) {
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
  ) {
    throw new Error("customer-service-subscriptions schedule-preview requires --key and --through");
  }
  return { bankAccountId, bankAdapterVersion };
}

export async function tryBuildCommercialAndBankingPayload(
  resource: string,
  action: string,
  values: CliValues,
  bankContext: BankImportArgsContext,
): Promise<{ matched: true; payload: unknown } | { matched: false }> {
  if (RELATIONSHIP_BACKFILL_RESOURCES.has(resource) && values.file) {
    return { matched: true, payload: JSON.parse(await readFile(values.file, "utf8")) };
  }
  if (resource === "bank-imports" && values.file) {
    return {
      matched: true,
      payload: {
        schemaVersion: 1,
        financialAccountId: bankContext.bankAccountId,
        adapterId: values.adapter ?? "generic-csv",
        adapterVersion: bankContext.bankAdapterVersion,
        filename: basename(values.file),
        csvText: await readFile(values.file, "utf8"),
        ...(values.mapping ? { columnMapping: JSON.parse(values.mapping) } : {}),
      },
    };
  }
  if (resource === "statement-sessions") {
    return {
      matched: true,
      payload: {
        ...(values["account-id"] ? { financialAccountId: values["account-id"] } : {}),
        ...(values.from ? { periodStart: values.from } : {}),
        ...(values.to ? { periodEnd: values.to } : {}),
        ...(values.status ? { state: values.status } : {}),
        ...(values.cursor ? { cursor: values.cursor } : {}),
        ...(values.limit ? { limit: values.limit } : {}),
      },
    };
  }
  if (PROJECT_RECOGNITION_RESOURCES.has(resource)) {
    return {
      matched: true,
      payload: {
        ...(values["project-id"] ? { projectId: values["project-id"] } : {}),
        ...(values["as-of"] ? { asOf: values["as-of"] } : {}),
        ...(values.status ? { state: values.status } : {}),
        ...(values.from ? { from: values.from } : {}),
        ...(values.to ? { to: values.to } : {}),
      },
    };
  }
  if (resource === "service-plans") {
    return {
      matched: true,
      payload: {
        ...(values["service-line"] ? { serviceLineCode: values["service-line"] } : {}),
        ...(values["active-only"] !== undefined ? { active: values["active-only"] } : {}),
      },
    };
  }
  if (resource === "customer-service-subscriptions") {
    return {
      matched: true,
      payload:
        action === "schedule-preview"
          ? { ...(values.through ? { through: values.through } : {}) }
          : {
              ...(values["customer-id"] ? { customerId: values["customer-id"] } : {}),
              ...(values["service-plan-id"] ? { servicePlanId: values["service-plan-id"] } : {}),
              ...(values["project-id"] ? { projectId: values["project-id"] } : {}),
              ...(values.status ? { lifecycle: values.status } : {}),
            },
    };
  }
  if (resource.startsWith("bank-")) {
    return {
      matched: true,
      payload: {
        ...(values["account-id"] ? { financialAccountId: values["account-id"] } : {}),
        ...(values.from ? { from: values.from } : {}),
        ...(values.to ? { to: values.to } : {}),
      },
    };
  }
  return { matched: false };
}
