import { financialStatementsApi, type FinancialStatementKind } from "@/lib/api";

export const endpointByKind = {
  profit_and_loss: financialStatementsApi.profitAndLoss,
  balance_sheet: financialStatementsApi.balanceSheet,
  cash_flow: financialStatementsApi.cashFlow,
  vat_reconciliation: financialStatementsApi.vatReconciliation,
} as const;

export const titleByKind = {
  profit_and_loss: "Báo cáo kết quả kinh doanh",
  balance_sheet: "Bảng cân đối kế toán",
  cash_flow: "Lưu chuyển tiền tệ trực tiếp",
  vat_reconciliation: "Đối soát VAT",
} as const;

export const currentMonth = () => new Date().toISOString().slice(0, 7);
export const monthStart = () => `${currentMonth()}-01`;
export const today = () => new Date().toISOString().slice(0, 10);

export const monthEnd = (month: string) => {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber!, 0)).toISOString().slice(0, 10);
};

export type PeriodKind = "month" | "quarter" | "year";

export function periodRange(anchorMonth: string, kind: PeriodKind) {
  const [year, month] = anchorMonth.split("-").map(Number);
  if (kind === "year")
    return { label: String(year), startsOn: `${year}-01-01`, endsOn: `${year}-12-31` };
  if (kind === "quarter") {
    const quarter = Math.ceil(month! / 3);
    const startMonth = String((quarter - 1) * 3 + 1).padStart(2, "0");
    const endMonth = `${year}-${String(quarter * 3).padStart(2, "0")}`;
    return {
      label: `${year}-Q${quarter}`,
      startsOn: `${year}-${startMonth}-01`,
      endsOn: monthEnd(endMonth),
    };
  }
  return { label: anchorMonth, startsOn: `${anchorMonth}-01`, endsOn: monthEnd(anchorMonth) };
}

export function shiftedMonth(anchorMonth: string, kind: PeriodKind, delta: number) {
  const [year, month] = anchorMonth.split("-").map(Number);
  const step = kind === "year" ? 12 : kind === "quarter" ? 3 : 1;
  const shifted = new Date(Date.UTC(year!, month! - 1 + delta * step, 1));
  return shifted.toISOString().slice(0, 7);
}

export function calendarRange(routeValue: string | undefined) {
  if (!routeValue) return undefined;
  const month = /^(?:CAL-)?(\d{4})-(0[1-9]|1[0-2])$/.exec(routeValue);
  if (month) {
    const year = Number(month[1]);
    const monthNumber = Number(month[2]);
    const endsOn = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
    return { startsOn: `${month[1]}-${month[2]}-01`, endsOn };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(routeValue)) {
    return { startsOn: `${routeValue.slice(0, 7)}-01`, endsOn: routeValue };
  }
  if (routeValue === "current") return { startsOn: monthStart(), endsOn: today() };
  return undefined;
}

export function reportQuery(
  searchParams: URLSearchParams,
  kind: FinancialStatementKind,
  routeValue?: string,
) {
  const query = new URLSearchParams();
  const routeRange = calendarRange(routeValue);
  const routeAsOf =
    kind === "balance_sheet" && routeValue && /^\d{4}-\d{2}-\d{2}$/.test(routeValue)
      ? routeValue
      : undefined;

  const kindParam = (searchParams.get("periodKind") as PeriodKind | null) ?? "year";
  const requestedPeriod = searchParams.get("periodId") ?? searchParams.get("period");
  const periodMatch = /^(?:CAL-)?(\d{4}-(?:0[1-9]|1[0-2]))$/.exec(
    requestedPeriod ?? `CAL-${currentMonth()}`,
  );
  const period = periodMatch?.[1] ?? currentMonth();
  const range = periodRange(period, kindParam);

  const defaultStart = range.startsOn;
  const defaultEnd = range.endsOn;

  const endsOn = searchParams.get("endsOn") ?? routeAsOf ?? routeRange?.endsOn ?? defaultEnd;
  if (kind !== "balance_sheet")
    query.set("startsOn", searchParams.get("startsOn") ?? routeRange?.startsOn ?? defaultStart);
  query.set("endsOn", endsOn);
  query.set("asOfInstant", searchParams.get("asOfInstant") ?? new Date().toISOString());
  query.set("framework", searchParams.get("framework") ?? "TT133");
  query.set("basis", kind === "cash_flow" ? "cash" : (searchParams.get("basis") ?? "accrual"));
  for (const key of ["projectId", "teamId", "serviceLineCode", "costCenterId"]) {
    const value = searchParams.get(key);
    if (value) query.set(key, value);
  }
  return query;
}

export function taxExceptionQuery(searchKey: string) {
  const q = new URLSearchParams(searchKey);
  const end = q.get("endsOn") ?? q.get("to") ?? today();
  const start = q.get("startsOn") ?? q.get("from") ?? `${end.substring(0, 4)}-01-01`;
  if (!q.has("startsOn")) q.set("startsOn", start);
  if (!q.has("endsOn")) q.set("endsOn", end);
  if (!q.has("asOfInstant")) q.set("asOfInstant", `${end}T16:59:59.999Z`);
  if (!q.has("framework")) q.set("framework", "TT133");
  if (!q.has("state")) q.set("state", "unreviewed");
  return q;
}
