import type { FundingPlanExportRow } from "./funding-plans.types.js";

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function formatFundingPlanCsv(rows: readonly FundingPlanExportRow[]): string {
  const header = [
    "kind",
    "id",
    "externalId",
    "date",
    "payee",
    "description",
    "grossMinor",
    "currentFunding",
    "currentAccount",
    "targetFunding",
  ].join(",");
  const lines = rows.map((r) =>
    [
      r.kind,
      r.id,
      r.externalId,
      r.date,
      r.payee,
      r.description,
      r.grossMinor,
      r.currentFunding,
      r.currentAccount,
      r.targetFunding,
    ]
      .map(csvEscape)
      .join(","),
  );
  return [header, ...lines].join("\n");
}

export function classifyFundingBucket(
  accountCode: string,
  financialAccountCode: string | null,
  financialKind: string | null,
): "owner_paid" | "owner_custody_cash" | "company_cash" | "company_bank" {
  if (financialAccountCode === "CASH-OWNER-CUSTODY" || accountCode === "111-OWNER-CUSTODY") {
    return "owner_custody_cash";
  }
  if (financialKind === "cash") return "company_cash";
  if (financialKind === "bank" || accountCode.startsWith("112")) return "company_bank";
  if (accountCode.startsWith("111")) return "company_cash";
  return "owner_paid";
}
