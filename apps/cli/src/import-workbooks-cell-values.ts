import { createHash } from "node:crypto";
import type ExcelJS from "exceljs";

export const textValue = (value: ExcelJS.CellValue): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if ("result" in value) return textValue(value.result as ExcelJS.CellValue);
    if ("text" in value && typeof value.text === "string") return value.text;
  }
  return String(value).trim();
};

export function parseDate(value: ExcelJS.CellValue): string {
  const resolved = value && typeof value === "object" && "result" in value ? value.result : value;
  if (resolved instanceof Date && !Number.isNaN(resolved.valueOf())) {
    return resolved.toISOString().slice(0, 10);
  }
  const raw = textValue(resolved as ExcelJS.CellValue);
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1]!;
  const vietnamese = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (vietnamese) {
    return `${vietnamese[3]}-${vietnamese[2]!.padStart(2, "0")}-${vietnamese[1]!.padStart(2, "0")}`;
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.valueOf())) return parsed.toISOString().slice(0, 10);
  throw new Error(`invalid date ${JSON.stringify(raw)}`);
}

export function parseMoney(value: ExcelJS.CellValue): bigint {
  if (value === null || value === undefined || value === "") throw new Error("missing money value");
  if (typeof value === "object" && "formula" in value) {
    if (value.result === undefined || value.result === null) {
      throw new Error(`formula has no cached result: ${value.formula}`);
    }
    return parseMoney(value.result as ExcelJS.CellValue);
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error(`money is not an exact integer: ${value}`);
    return BigInt(value);
  }
  if (typeof value === "bigint") return value;
  const raw = textValue(value);
  const negative = /^\s*-/.test(raw);
  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) throw new Error(`invalid money ${JSON.stringify(raw)}`);
  return BigInt(`${negative ? "-" : ""}${digits}`);
}

export const optionalMoney = (value: unknown): string | null => {
  const raw = textValue(value as ExcelJS.CellValue);
  return raw ? parseMoney(value as ExcelJS.CellValue).toString() : null;
};

export const controlPeriod = (value: unknown): string | undefined => {
  const raw = textValue(value as ExcelJS.CellValue);
  const exact = raw.match(/^(\d{4})-(\d{1,2})$/);
  if (exact) return `${exact[1]}-${exact[2]!.padStart(2, "0")}`;
  const month = raw.match(/^(\d{1,2})$/);
  if (month && Number(month[1]) >= 1 && Number(month[1]) <= 12)
    return `2025-${month[1]!.padStart(2, "0")}`;
  const date = raw.match(/^(\d{4})-(\d{2})-\d{2}/);
  return date ? `${date[1]}-${date[2]}` : undefined;
};

export const targetAttainmentBps = (value: unknown): number | null => {
  const raw = textValue(value as ExcelJS.CellValue).replace(/\s/g, "");
  if (!raw) return null;
  const numeric = Number(raw.replace("%", "").replace(",", "."));
  if (!Number.isFinite(numeric)) return null;
  const percentage = raw.includes("%") ? numeric : Math.abs(numeric) <= 1 ? numeric * 100 : numeric;
  return Math.round(percentage * 100);
};

export const stableId = (kind: string, workbookHash: string, sheet: string, row: number) =>
  `${kind}-${createHash("sha256").update(`${workbookHash}:${sheet}:${row}`).digest("hex").slice(0, 24)}`;

export const countFormulas = (sheet: ExcelJS.Worksheet) => {
  let count = 0;
  sheet.eachRow({ includeEmpty: false }, (row) =>
    row.eachCell((cell) => {
      if (cell.value && typeof cell.value === "object" && "formula" in cell.value) count += 1;
    }),
  );
  return count;
};
