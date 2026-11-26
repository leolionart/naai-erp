export type Kind = "documents" | "expenses";
export type SourceKind = "documents" | "expenses" | "recognition";
export type Row = Record<string, unknown>;
export const nonNullRow = (row: Row | null | undefined): row is Row => Boolean(row);
export type TaggedRow = Row & {
  __sourceKind: SourceKind;
  __invoicePresence: "present" | "missing";
  __revenueAxis?: "invoiced" | "recognized";
};
export const config = {
  documents: {
    endpoint: "commercial-documents",
    singular: "hoạt động doanh thu",
    title: "Quản lý doanh thu",
    newTitle: "Tạo hóa đơn",
    detailTitle: "Chi tiết hóa đơn",
  },
  expenses: {
    endpoint: "expenses",
    singular: "hoạt động chi phí",
    title: "Quản lý chi phí",
    newTitle: "Tạo chi phí",
    detailTitle: "Chi tiết chi phí",
  },
} as const;
export const documentActions: Record<string, Record<string, readonly string[]>> = {
  sales_invoice: { draft: ["validate", "cancel"], validated: ["issue", "cancel"] },
  purchase_invoice: {
    draft: ["capture", "cancel"],
    captured: ["verify", "cancel"],
    verified: ["approve", "cancel"],
    approved: ["post"],
  },
  credit_note: { draft: ["validate", "cancel"], validated: ["issue", "cancel"] },
};
export const expenseActions: Record<string, readonly string[]> = {
  draft: ["submit"],
  submitted: ["mark-evidence-pending", "approve", "reject"],
  evidence_pending: ["submit", "reject"],
  approved: ["post"],
};

export function text(row: Row | undefined, ...keys: string[]) {
  for (const key of keys) {
    const snake = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    const value = row?.[key] ?? row?.[snake];
    if (value !== undefined && value !== null && value !== "") return String(value);
  }
  return "";
}
export function items(payload: readonly Row[] | { items?: readonly Row[] }): readonly Row[] {
  return Array.isArray(payload)
    ? (payload as readonly Row[])
    : ((payload as { items?: readonly Row[] }).items ?? []);
}
export function money(value: unknown) {
  if (value === undefined || value === null || value === "") return "—";
  try {
    const cleanStr = String(value).replace(/[^0-9-]/g, "");
    if (!cleanStr) return `${value} ₫`;
    return `${new Intl.NumberFormat("vi-VN").format(BigInt(cleanStr))} ₫`;
  } catch {
    return `${value} ₫`;
  }
}
export function human(value: string) {
  return value ? value.replaceAll("_", " ") : "—";
}
export const FUNDING_OPTIONS = [
  { code: "111-CASH", label: "Quỹ tiền mặt công ty (TK 111)" },
  { code: "112-BANK", label: "Tài khoản ngân hàng công ty (TK 112)" },
  { code: "3388-OWNER", label: "Chủ doanh nghiệp chi hộ (TK 3388)" },
] as const;
export type FundingOption = Readonly<{
  /** Ledger account the payment source posts to. */
  code: string;
  label: string;
  /** Set for a financial account; needed to tell owner-held custody cash from company cash. */
  financialAccountId?: string;
}>;

/** Stable select value: financial accounts are told apart by id because they can share a ledger code. */
export function fundingOptionValue(option: FundingOption) {
  return option.financialAccountId ? `account:${option.financialAccountId}` : option.code;
}

export function findFundingOption(value: string, options: readonly FundingOption[]) {
  return options.find((option) => fundingOptionValue(option) === value);
}

/** Request fields for the expense funding reclassification API. */
export function fundingTarget(value: string, options: readonly FundingOption[]) {
  const option = findFundingOption(value, options);
  return option?.financialAccountId
    ? { financialAccountId: option.financialAccountId }
    : { counterAccountCode: option?.code ?? value };
}

/** Whether an option is already the record's current payment source. */
export function isCurrentFunding(option: FundingOption, row: Row | undefined) {
  const currentAccount = text(row, "fundingFinancialAccountId", "funding_financial_account_id");
  if (currentAccount) return option.financialAccountId === currentAccount;
  return !option.financialAccountId && option.code === fundingCode(row);
}
export function fundingLabel(code: string, options: readonly FundingOption[] = FUNDING_OPTIONS) {
  const root = code.split("-")[0];
  return (
    findFundingOption(code, options)?.label ??
    options.find((option) => option.code === code || option.code.startsWith(root))?.label ??
    code
  );
}
export function sourceKind(row: Row | undefined): SourceKind {
  const value = row?.__sourceKind;
  return value === "expenses" || value === "recognition" ? value : "documents";
}
export function sourceEndpoint(source: SourceKind) {
  if (source === "expenses") return "expenses";
  if (source === "recognition") return "revenue-recognition-events";
  return "commercial-documents";
}
export function fundingCode(row: Row | undefined) {
  return sourceKind(row) === "documents"
    ? text(row, "controlAccountCode", "counterAccountCode")
    : text(row, "counterAccountCode", "controlAccountCode");
}
export function tagRow(
  row: Row,
  source: SourceKind,
  presence: "present" | "missing",
  revenueAxis?: "invoiced" | "recognized",
): TaggedRow {
  return { ...row, __sourceKind: source, __invoicePresence: presence, __revenueAxis: revenueAxis };
}

export function queryFor(kind: Kind, params: URLSearchParams) {
  const query = new URLSearchParams();
  for (const key of kind === "documents"
    ? ["type", "state", "partyId", "projectId", "startsOn", "endsOn", "categoryId"]
    : ["state", "class", "payeePartyId", "startsOn", "endsOn", "categoryId"]) {
    const value = params.get(key);
    if (value && value !== "unclassified") query.set(key, value);
  }
  return query;
}
