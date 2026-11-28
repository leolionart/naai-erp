import { ApiClientError } from "@/lib/api";
import { recordCategory } from "@/lib/records/category";
import {
  FUNDING_OPTIONS,
  fundingCode,
  items,
  text,
  type FundingOption,
  type Kind,
  type Row,
} from "./focused-record-shared";

export type ExpenseCostMode = "all" | "company_real" | "tax_only";

export const EXPENSE_COST_MODE_OPTIONS: readonly Readonly<{
  value: ExpenseCostMode;
  label: string;
}>[] = [
  { value: "all", label: "Tất cả" },
  { value: "company_real", label: "Chi phí thực công ty" },
  { value: "tax_only", label: "HĐ khấu trừ thuế" },
];

export function parseExpenseCostMode(value: string | null | undefined): ExpenseCostMode {
  if (value === "company_real" || value === "tax_only") return value;
  return "all";
}

export function extractCategoryCatalog(
  payloads: readonly (readonly Row[] | { items?: readonly Row[] })[],
): {
  names: Readonly<Record<string, string>>;
  treatments: Readonly<Record<string, string>>;
} {
  const names: Record<string, string> = {};
  const treatments: Record<string, string> = {};
  for (const payload of payloads) {
    for (const row of items(payload)) {
      const code = text(row, "code");
      if (!code) continue;
      const name = text(row, "name");
      if (name) names[code] = name;
      const isActive = row.isActive ?? row.is_active;
      if (isActive === false) continue;
      const treatment = text(row, "fundingTreatment", "funding_treatment");
      if (treatment) treatments[code] = treatment;
    }
  }
  return { names, treatments };
}

function resolveExplicitFundingTreatment(row: Row): string {
  const rowTreatments = row.fundingTreatments ?? row.funding_treatments;
  if (Array.isArray(rowTreatments)) {
    for (const candidate of rowTreatments) {
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    }
  }
  if (Array.isArray(row.lines)) {
    for (const line of row.lines as (Row | null | undefined)[]) {
      if (!line) continue;
      const lineTreatment = text(line, "fundingTreatment", "funding_treatment");
      if (lineTreatment) return lineTreatment;
    }
  }
  return "";
}

export function isRealCompanyExpenseRow(
  row: Row,
  categoryTreatments: Readonly<Record<string, string>>,
): boolean {
  if (text(row, "fundingFinancialAccountId", "funding_financial_account_id")) return true;
  const accountCode = fundingCode(row);
  if (accountCode.startsWith("111") || accountCode.startsWith("112")) return true;
  const category = recordCategory(row);
  const treatment =
    resolveExplicitFundingTreatment(row) || (category ? (categoryTreatments[category] ?? "") : "");
  if (treatment === "owner_paid_company_cost" || treatment === "company_funds") return true;
  if (treatment === "tax_only_non_cash") return false;
  return accountCode.startsWith("331");
}

export function matchesExpenseCostMode(
  row: Row,
  mode: ExpenseCostMode,
  categoryTreatments: Readonly<Record<string, string>>,
): boolean {
  if (mode === "all") return true;
  const realCompanyExpense = isRealCompanyExpenseRow(row, categoryTreatments);
  return mode === "company_real" ? realCompanyExpense : !realCompanyExpense;
}

const VOIDED_EXPENSE_STATES = new Set(["cancelled", "reversed", "rejected", "discarded"]);
const POSTED_EXPENSE_STATES = new Set(["posted", "issued", "partially_paid", "paid"]);

export type FilteredExpenseSummary = Readonly<{
  totalMinor: bigint;
  postedMinor: bigint;
}>;

export function summarizeFilteredExpenseAmounts(rows: readonly Row[]): FilteredExpenseSummary {
  let totalMinor = 0n;
  let postedMinor = 0n;
  for (const row of rows) {
    const state = text(row, "state");
    if (VOIDED_EXPENSE_STATES.has(state)) continue;
    const rawAmount = text(row, "grossMinor", "gross_minor", "amountMinor", "amount_minor");
    if (!rawAmount) continue;
    try {
      const clean = rawAmount.replace(/[^0-9-]/g, "");
      if (!clean) continue;
      const amount = BigInt(clean);
      totalMinor += amount;
      if (POSTED_EXPENSE_STATES.has(state)) postedMinor += amount;
    } catch {
      continue;
    }
  }
  return { totalMinor, postedMinor };
}

export function buildReclassifyFundingOptions(
  financialAccounts: readonly Row[] | undefined,
): readonly FundingOption[] {
  if (financialAccounts === undefined) return FUNDING_OPTIONS;
  const options: FundingOption[] = [];
  const seenIds = new Set<string>();
  for (const account of financialAccounts) {
    const status = text(account, "status");
    if (status && status !== "active") continue;
    const code = text(account, "ledgerAccountCode", "ledger_account_code");
    const id = text(account, "id");
    if (!code || !id || seenIds.has(id)) continue;
    seenIds.add(id);
    const displayName = text(account, "displayName", "display_name", "name") || code;
    options.push({ code, label: `${displayName} (${code})`, financialAccountId: id });
  }
  if (!options.some((option) => option.code === "3388-OWNER" && !option.financialAccountId)) {
    options.push({ code: "3388-OWNER", label: "Chủ doanh nghiệp chi hộ (TK 3388)" });
  }
  return options;
}

export async function downloadFocusedWorkbook({
  kind,
  paramsKey,
  initialProjectId,
  initialPartyId,
  baseUrl,
  organizationId,
  token,
}: {
  kind: Kind;
  paramsKey: string;
  initialProjectId?: string;
  initialPartyId?: string;
  baseUrl: string;
  organizationId: string;
  token: string;
}): Promise<void> {
  const currentParams = new URLSearchParams(paramsKey);
  const query = new URLSearchParams();
  for (const name of ["startsOn", "endsOn", "state", "projectId"]) {
    const value = currentParams.get(name);
    if (value) query.set(name, value);
  }
  const partyKey = kind === "documents" ? "partyId" : "payeePartyId";
  const partyValue = currentParams.get(partyKey);
  if (partyValue) query.set(partyKey, partyValue);
  const presence = currentParams.get("invoiceStatus");
  if (presence && presence !== "all") query.set("invoicePresence", presence);
  if (initialProjectId && !query.has("projectId")) query.set("projectId", initialProjectId);
  if (initialPartyId && !query.has(partyKey)) query.set(partyKey, initialPartyId);
  const exportPath =
    kind === "documents"
      ? "accounting-list-exports/sales-invoices"
      : "accounting-list-exports/purchase-invoices-expenses";
  const response = await fetch(
    `${baseUrl}/api/v1/organizations/${encodeURIComponent(organizationId)}/${exportPath}?${query}`,
    {
      headers: {
        accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        authorization: `Bearer ${token}`,
        "x-correlation-id": crypto.randomUUID(),
      },
    },
  );
  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as
      { error?: { code?: string; message?: string } } | undefined;
    throw new ApiClientError({
      status: response.status,
      code: payload?.error?.code,
      message: payload?.error?.message ?? `Không thể export XLSX (HTTP ${response.status}).`,
    });
  }
  const disposition = response.headers.get("content-disposition");
  const serverFilename = disposition?.match(/filename="?([^";]+)"?/i)?.[1];
  const range = [query.get("startsOn"), query.get("endsOn")].filter(Boolean).join("_");
  const fallbackFilename = `naai-erp-${kind === "documents" ? "doanh-thu" : "chi-phi"}${range ? `-${range}` : ""}.xlsx`;
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = serverFilename ?? fallbackFilename;
  anchor.click();
  URL.revokeObjectURL(url);
}
