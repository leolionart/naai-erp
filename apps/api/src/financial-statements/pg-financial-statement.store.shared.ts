import { createHash } from "node:crypto";

export type LedgerRow = {
  journal_id: string;
  journal_version: string;
  journal_date: string;
  posted_at: string;
  line_number: number;
  account_code: string;
  account_name: string;
  root_type: "asset" | "liability" | "equity" | "revenue" | "expense";
  debit_minor: string | null;
  credit_minor: string | null;
  dimensions: Record<string, string>;
  line_code: string | null;
  label: string | null;
  display_order: number | null;
  sign: number | null;
  cash_flow_class: string | null;
  vat_treatment: string | null;
  line_description?: string | null;
};

export const fingerprint = (rows: readonly LedgerRow[]) =>
  createHash("sha256")
    .update(
      rows
        .map((r) => `${r.journal_id}:${r.journal_version}:${r.posted_at}`)
        .sort()
        .join("|"),
    )
    .digest("hex");
export const matchesDimensions = (row: LedgerRow, dimensions: Record<string, string>) =>
  Object.entries(dimensions).every(([key, value]) => row.dimensions?.[key] === value);
export const natural = (row: LedgerRow) => {
  const debit = BigInt(row.debit_minor ?? "0");
  const credit = BigInt(row.credit_minor ?? "0");
  return ["liability", "equity", "revenue"].includes(row.root_type)
    ? credit - debit
    : debit - credit;
};
export const jsonMoney = (value: unknown): unknown =>
  typeof value === "bigint"
    ? value.toString()
    : Array.isArray(value)
      ? value.map(jsonMoney)
      : value && typeof value === "object"
        ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonMoney(item)]))
        : value;
