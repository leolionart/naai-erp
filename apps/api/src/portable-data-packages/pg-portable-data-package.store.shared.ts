import { createHash } from "node:crypto";
import { type PortableCellTypeContract } from "@naai-erp/contracts";
import { MASTER_DATA_RESOURCES } from "../master-data/resource-registry.js";

export const LOCAL_RESET_PRESERVE = new Set([
  "organizations",
  "organization_memberships",
  "membership_roles",
  "api_credentials",
  "api_idempotency_records",
  "portable_data_packages",
  "accounts",
  "fiscal_years",
  "fiscal_periods",
  "tax_code_versions",
  "dimension_values",
  "dimension_requirement_versions",
  "statutory_account_mappings",
  "default_mapping_versions",
  "posting_rule_versions",
  "accounting_workflow_policies",
  "financial_statement_mapping_versions",
  "financial_statement_mapping_lines",
  "executive_metric_policies",
  "roi_definitions",
]);
export const quoteIdentifier = (value: string) => `"${value.replaceAll('"', '""')}"`;

export type ColumnRow = Readonly<{
  table_name: string;
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: "YES" | "NO";
  ordinal_position: number;
}>;

export const EXCLUDED_RESOURCES: Readonly<Record<string, string>> = {
  api_credentials: "Authentication credentials and token hashes are never portable business data",
  api_idempotency_records: "Internal request replay controls are environment-local",
  portable_data_packages: "Generated package bytes cannot recursively contain data packages",
  portable_data_imports: "Import staging and replay controls are environment-local",
};
export const SECRET_COLUMN =
  /(^|_)(secret|password|token_hash|access_token|refresh_token|private_key|signed_url)($|_)/i;
export const BINARY_TYPES = new Set(["bytea"]);
export const DATE_COLUMNS = [
  "created_at",
  "occurred_at",
  "generated_at",
  "captured_at",
  "received_at",
];
export const MASTER_RESOURCE_BY_TABLE = new Map<string, string>(
  Object.entries(MASTER_DATA_RESOURCES).map(([resource, definition]) => [
    definition.table,
    resource,
  ]),
);
export const quote = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;
export const sha = (value: string) => createHash("sha256").update(value).digest("hex");
export const canonical = (value: unknown) =>
  JSON.stringify(
    value,
    Object.keys((value && typeof value === "object" ? value : {}) as object).sort(),
  );
export const scalar = (value: unknown): string | boolean | null => {
  if (value == null) return null;
  if (typeof value === "boolean" || typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint" || typeof value === "number") return String(value);
  return JSON.stringify(value);
};
export const cellType = (column: ColumnRow): PortableCellTypeContract => {
  if (column.data_type === "boolean") return "boolean";
  if (["smallint", "integer", "bigint", "numeric", "decimal"].includes(column.data_type))
    return "integer";
  if (column.data_type === "date") return "date";
  if (column.data_type.includes("timestamp")) return "timestamp";
  if (["json", "jsonb", "ARRAY"].includes(column.data_type)) return "json";
  return "string";
};
