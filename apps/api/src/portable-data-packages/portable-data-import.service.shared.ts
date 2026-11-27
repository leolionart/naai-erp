import { createHash } from "node:crypto";
import { type PortableRowIssueContract } from "@naai-erp/contracts";
import { canonicalJson } from "@naai-erp/domain";
import type ExcelJS from "exceljs";

export const IMPORT_ROLES = new Set(["owner", "finance_admin", "accountant"]);
export const OPERATIONS = new Set([
  "no_change",
  "create",
  "update",
  "deactivate",
  "cancel",
  "reverse_replace",
]);
export const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
export const packageHash = (value: unknown) => sha256(canonicalJson(value as never));
export const issue = (code: string, message: string, field?: string): PortableRowIssueContract => ({
  code,
  message,
  ...(field ? { field } : {}),
  severity: "error",
});
export const text = (value: ExcelJS.CellValue) => (value == null ? "" : String(value).trim());
export const jsonObject = (value: ExcelJS.CellValue, field: string) => {
  const raw = text(value);
  if (!raw) return {};
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error(`${field} must be a JSON object`);
  return parsed as Record<string, string | null>;
};
export const jsonExternalReferences = (value: ExcelJS.CellValue) => {
  const raw = text(value);
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("externalReferences must be a JSON array");
  return parsed.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      throw new Error("externalReferences entries must be objects");
    const system = String((entry as Record<string, unknown>).system ?? "").trim();
    const externalId = String((entry as Record<string, unknown>).externalId ?? "").trim();
    if (!system || !externalId)
      throw new Error("externalReferences entries require system and externalId");
    return { system, externalId };
  });
};
