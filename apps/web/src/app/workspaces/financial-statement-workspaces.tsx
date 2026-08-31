"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Camera, ChevronRight, Filter, Search } from "lucide-react";
import {
  FinancialDataTable,
  type FinancialColumn,
} from "@/components/financial/financial-data-table";
import { KpiCard } from "@/components/financial/kpi-card";
import { MoneyCell } from "@/components/financial/money-cell";
import { StatusBadge } from "@/components/financial/status-badge";
import { QuickDatePresetButtons } from "@/components/ui/quick-date-range-picker";
import { PeriodRangeNavigator } from "@/components/layout/period-range-navigator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverActiveAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverFooter,
  PopoverHeader,
  PopoverTitle,
} from "@/components/ui/popover";
import {
  financialStatementsApi,
  type FinancialStatementDrilldown,
  type FinancialStatementKind,
  type FinancialStatementLine,
  type FinancialStatementReport,
  type RawFinancialStatementReport,
  type RawTaxExpenseReview,
  type TaxExpenseException,
  useAuthenticatedApiClient,
} from "@/lib/api";
import { type ReportSnapshotContract } from "@naai-erp/contracts";

const endpointByKind = {
  profit_and_loss: financialStatementsApi.profitAndLoss,
  balance_sheet: financialStatementsApi.balanceSheet,
  cash_flow: financialStatementsApi.cashFlow,
  vat_reconciliation: financialStatementsApi.vatReconciliation,
} as const;
const titleByKind = {
  profit_and_loss: "Báo cáo kết quả kinh doanh",
  balance_sheet: "Bảng cân đối kế toán",
  cash_flow: "Lưu chuyển tiền tệ trực tiếp",
  vat_reconciliation: "Đối soát VAT",
} as const;
const currentMonth = () => new Date().toISOString().slice(0, 7);
const monthStart = () => `${currentMonth()}-01`;
const today = () => new Date().toISOString().slice(0, 10);

const monthEnd = (month: string) => {
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

const statementLine = (
  statement: FinancialStatementKind,
  lineCode: string,
  label: string,
  amountMinor: string,
  sourceLineIds: readonly string[] = [],
): FinancialStatementLine => ({
  lineCode,
  label,
  amountMinor,
  sourceLineIds,
  sourceLineCount: sourceLineIds.length,
  drillDown: { statement, lineCode },
});

function normalizeReport(
  kind: FinancialStatementKind,
  raw: RawFinancialStatementReport | FinancialStatementReport,
  query: URLSearchParams,
): FinancialStatementReport {
  if ("statement" in raw) return raw;
  const framework = (query.get("framework") === "TT200" ? "TT200" : "TT133") as "TT133" | "TT200";
  const asOfInstant = query.get("asOfInstant") ?? `${today()}T16:59:59.999Z`;
  const startsOn = "startsOn" in raw ? raw.startsOn : null;
  const endsOn = "endsOn" in raw ? raw.endsOn : raw.asOfDate;
  const common = {
    statement: kind,
    basis: kind === "cash_flow" ? "cash" : kind === "profit_and_loss" ? "accrual" : "accrual",
    range: { startsOn, endsOn },
    asOfInstant,
    framework,
    formulaVersion: raw.formulaVersion,
    mappingVersion: { id: "approved-mapping", version: 1 },
    sourceFingerprint: "ledgerCutoff" in raw ? raw.ledgerCutoff.sourceFingerprint : "",
    sourceLineCount: "ledgerCutoff" in raw ? raw.ledgerCutoff.lineCount : raw.sourceIds.length,
  } as const;
  if (kind === "profit_and_loss" && "netProfitMinor" in raw) {
    return {
      ...common,
      final: raw.status === "ready",
      status: raw.status,
      lines: [
        statementLine(kind, "revenue", "Doanh thu", raw.revenueMinor),
        statementLine(kind, "direct_cost", "Chi phí trực tiếp", raw.directCostMinor),
        statementLine(kind, "gross_profit", "Gross profit", raw.grossProfitMinor),
        statementLine(kind, "opex", "OPEX", raw.operatingExpenseMinor),
        statementLine(kind, "operating_profit", "Operating profit", raw.operatingProfitMinor),
        statementLine(kind, "other_income", "Thu nhập khác", raw.otherIncomeMinor),
        statementLine(kind, "other_expense", "Chi phí khác", raw.otherExpenseMinor),
        statementLine(kind, "tax_expense", "Thuế thu nhập", raw.incomeTaxMinor),
        statementLine(kind, "net_profit", "Net profit", raw.netProfitMinor),
      ],
      totalMinor: raw.netProfitMinor,
      unmappedAccountCodes: raw.unclassifiedRows.map((row) => row.key),
    };
  }
  if (kind === "balance_sheet" && "equationDifferenceMinor" in raw) {
    return {
      ...common,
      final: raw.equationDifferenceMinor === "0",
      status: raw.equationDifferenceMinor === "0" ? "ready" : "invalid",
      lines: [
        statementLine(kind, "assets", "Tổng tài sản", raw.assetsMinor),
        statementLine(kind, "liabilities", "Nợ phải trả", raw.liabilitiesMinor),
        statementLine(kind, "ledger_equity", "Vốn góp / equity đã ghi sổ", raw.ledgerEquityMinor),
        statementLine(
          kind,
          "unclosed_earnings",
          "Lợi nhuận chưa kết chuyển",
          raw.unclosedEarningsMinor,
        ),
        statementLine(kind, "total_equity", "Tổng vốn chủ sở hữu", raw.totalEquityMinor),
      ],
      equation: {
        assetsMinor: raw.assetsMinor,
        liabilitiesMinor: raw.liabilitiesMinor,
        equityMinor: raw.totalEquityMinor,
        differenceMinor: raw.equationDifferenceMinor,
        balanced: raw.equationDifferenceMinor === "0",
      },
    };
  }
  if (kind === "cash_flow" && "netCashFlowMinor" in raw) {
    return {
      ...common,
      basis: "cash",
      method: "direct",
      final: raw.status === "ready",
      status: raw.status,
      lines: [
        statementLine(kind, "opening_cash", "Opening cash", raw.openingCashMinor),
        statementLine(kind, "operating", "Operating cash flow", raw.operatingCashFlowMinor),
        statementLine(kind, "investing", "Investing cash flow", raw.investingCashFlowMinor),
        statementLine(kind, "financing", "Financing cash flow", raw.financingCashFlowMinor),
        statementLine(
          kind,
          "unclassified",
          "Unclassified cash flow",
          raw.unclassifiedCashFlowMinor,
        ),
        statementLine(kind, "net_cash_flow", "Net cash movement", raw.netCashFlowMinor),
        statementLine(kind, "closing_cash", "Closing cash", raw.closingCashMinor),
      ],
      openingCashMinor: raw.openingCashMinor,
      operatingCashFlowMinor: raw.operatingCashFlowMinor,
      investingCashFlowMinor: raw.investingCashFlowMinor,
      financingCashFlowMinor: raw.financingCashFlowMinor,
      netCashMovementMinor: raw.netCashFlowMinor,
      closingCashMinor: raw.closingCashMinor,
      exceptions: raw.confidenceFlags.map((flag) => ({ code: flag.code })),
    };
  }
  if (kind === "vat_reconciliation" && "netVatPayableMinor" in raw) {
    return {
      ...common,
      final: raw.status === "ready",
      status: raw.status,
      lines: [
        statementLine(kind, "output_vat", "VAT đầu ra", raw.outputVatMinor, raw.sourceIds),
        statementLine(kind, "input_vat", "VAT đầu vào", raw.inputVatMinor, raw.sourceIds),
        statementLine(
          kind,
          "eligible_input_vat",
          "Input VAT đủ điều kiện",
          raw.eligibleInputVatMinor,
          raw.sourceIds,
        ),
        statementLine(
          kind,
          "ineligible_input_vat",
          "Input VAT không đủ điều kiện",
          raw.ineligibleInputVatMinor,
          raw.sourceIds,
        ),
        statementLine(
          kind,
          "unreviewed_input_vat",
          "Input VAT chưa review",
          raw.unreviewedInputVatMinor,
          raw.sourceIds,
        ),
        statementLine(
          kind,
          "net_vat_payable",
          "VAT phải nộp / (được khấu trừ)",
          raw.netVatPayableMinor,
          raw.sourceIds,
        ),
      ],
      totals: {
        outputVatMinor: raw.outputVatMinor,
        inputVatMinor: raw.inputVatMinor,
        eligibleInputVatMinor: raw.eligibleInputVatMinor,
        ineligibleInputVatMinor: raw.ineligibleInputVatMinor,
        unreviewedInputVatMinor: raw.unreviewedInputVatMinor,
        netVatPayableMinor: raw.netVatPayableMinor,
      },
      controls: {
        unreviewedExpenseLineCount: String(raw.unreviewedItemIds.length),
        missingEvidenceExpenseCount: String(raw.missingEvidenceItemIds.length),
        invalidTaxCodeLineCount: String(raw.invalidTaxCodeItemIds.length),
        differenceMinor: (
          BigInt(raw.outputDifferenceMinor) + BigInt(raw.inputDifferenceMinor)
        ).toString(),
      },
      items: raw.items ?? [],
    };
  }
  throw new Error("API trả về contract báo cáo không phù hợp với route");
}

function taxReviewQueueHref(report: FinancialStatementReport) {
  const params = new URLSearchParams({
    state: "exception",
    endsOn: report.range.endsOn,
    framework: report.framework,
  });
  if (report.range.startsOn) params.set("startsOn", report.range.startsOn);
  return `/reports/tax/expense-exceptions?${params.toString()}`;
}

function vatSourceHref(report: FinancialStatementReport) {
  return report.items?.length ? "#vat-source-items" : taxReviewQueueHref(report);
}

function vatReadinessMessage(report: FinancialStatementReport) {
  const unreviewed = Number(report.controls?.unreviewedExpenseLineCount ?? "0");
  const missingEvidence = Number(report.controls?.missingEvidenceExpenseCount ?? "0");
  const invalidTaxCodes = Number(report.controls?.invalidTaxCodeLineCount ?? "0");
  const differenceMinor = report.controls?.differenceMinor ?? "0";
  const blockers: string[] = [];
  if (unreviewed > 0) blockers.push(`${unreviewed} dòng VAT chưa review`);
  if (missingEvidence > 0) blockers.push(`${missingEvidence} dòng thiếu chứng từ/đối soát`);
  if (invalidTaxCodes > 0) blockers.push(`${invalidTaxCodes} dòng thiếu hoặc sai mã thuế VAT`);
  if (differenceMinor !== "0") blockers.push(`chênh lệch đối soát ${differenceMinor} minor units`);
  return blockers.length
    ? `Còn ${blockers.join(" và ")} cần xử lý trước khi dùng số liệu như bản final.`
    : "Còn exception VAT cần xử lý trước khi dùng số liệu như bản final.";
}

function normalizeTaxException(value: unknown): TaxExpenseException {
  const item = value as Record<string, unknown>;
  if ("bookedMinor" in item) return item as TaxExpenseException;
  const source = (item.sourceIds ?? {}) as Record<string, unknown>;
  const evidence = Array.isArray(item.evidence) ? item.evidence : [];
  return {
    id: String(item.id ?? `${item.expense_id ?? "expense"}:${item.line_number ?? "line"}`),
    expenseId: String(item.expense_id ?? source.expenseId ?? ""),
    ...(item.source_type === "purchase_invoice" || item.expense_class === "invoice_backed"
      ? { sourceType: "purchase_invoice" as const }
      : { sourceType: "expense" as const }),
    ...(item.line_number !== undefined ? { lineNumber: Number(item.line_number) } : {}),
    expenseDate: String(item.expense_date ?? ""),
    description: String(item.description ?? "Chi phí cần rà soát"),
    ...(item.party_name ? { partyName: String(item.party_name) } : {}),
    // CIT basis is net expense; VAT is tracked separately below.
    bookedMinor: String(item.booked_net_minor ?? item.booked_gross_minor ?? "0"),
    vatBasisMinor: String(item.booked_vat_minor ?? "0"),
    citEligibleMinor: String(item.cit_eligible_minor ?? "0"),
    citIneligibleMinor: (
      BigInt(String(item.booked_gross_minor ?? "0")) -
      BigInt(String(item.cit_eligible_minor ?? "0"))
    ).toString(),
    vatEligibleMinor: String(item.vat_eligible_minor ?? "0"),
    vatIneligibleMinor: (
      BigInt(String(item.booked_vat_minor ?? "0")) - BigInt(String(item.vat_eligible_minor ?? "0"))
    ).toString(),
    citState: String(item.cit_state ?? "unreviewed"),
    vatState: String(item.vat_state ?? "unreviewed"),
    ...(item.tax_code ? { taxCode: String(item.tax_code) } : {}),
    ...(item.tax_code_approved !== undefined
      ? { taxCodeApproved: Boolean(item.tax_code_approved) }
      : {}),
    evidenceState: evidence.length ? "verified" : "missing",
    ...(item.paperless_url ? { paperlessUrl: String(item.paperless_url) } : {}),
    ...(item.reviewed_by ? { reviewer: String(item.reviewed_by) } : {}),
    ...(item.review_reason ? { reason: String(item.review_reason) } : {}),
    ...(Array.isArray(item.nextActions)
      ? {
          nextActions: item.nextActions.filter(
            (value): value is string => typeof value === "string",
          ),
        }
      : {}),
    ...(Array.isArray(item.exceptionCodes)
      ? {
          exceptionCodes: item.exceptionCodes.filter(
            (value): value is string => typeof value === "string",
          ),
        }
      : {}),
    sourceIds: Object.values(source).filter((value): value is string => typeof value === "string"),
  };
}

function calendarRange(routeValue: string | undefined) {
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

function reportQuery(
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

function ReportFilterSheet({
  open,
  onOpenChange,
  query,
  kind,
  onApply,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  query: URLSearchParams;
  kind: FinancialStatementKind;
  onApply: (data: FormData) => void;
}>) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverActiveAnchor open={Boolean(open)} />
      <PopoverContent
        align="end"
        sideOffset={8}
        className="max-h-[min(80vh,40rem)] w-[min(92vw,30rem)] overflow-y-auto"
      >
        <form action={onApply} className="flex flex-col">
          <PopoverHeader>
            <PopoverTitle>Bộ lọc báo cáo</PopoverTitle>
            <PopoverDescription>
              Kỳ, cutoff, framework và dimensions được lưu trên URL.
            </PopoverDescription>
          </PopoverHeader>
          <FieldGroup className="px-4">
            <QuickDatePresetButtons
              onSelectRange={(startsOn, endsOn) => {
                const form = document.querySelector("form") as HTMLFormElement | null;
                if (!form) return;
                const startInput = form.querySelector(
                  '[name="startsOn"]',
                ) as HTMLInputElement | null;
                const endInput = form.querySelector('[name="endsOn"]') as HTMLInputElement | null;
                if (startInput) startInput.value = startsOn;
                if (endInput) endInput.value = endsOn;
              }}
            />
            {kind !== "balance_sheet" ? (
              <Field>
                <FieldLabel htmlFor="statement-start">Từ ngày</FieldLabel>
                <Input
                  id="statement-start"
                  name="startsOn"
                  type="date"
                  defaultValue={query.get("startsOn") ?? monthStart()}
                  required
                />
              </Field>
            ) : null}
            <Field>
              <FieldLabel htmlFor="statement-end">Đến ngày / As of</FieldLabel>
              <Input
                id="statement-end"
                name="endsOn"
                type="date"
                defaultValue={query.get("endsOn") ?? today()}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="statement-cutoff">Ledger cutoff</FieldLabel>
              <Input
                id="statement-cutoff"
                name="asOfInstant"
                defaultValue={query.get("asOfInstant") ?? `${today()}T16:59:59.999Z`}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="statement-framework">Accounting framework</FieldLabel>
              <Select name="framework" defaultValue={query.get("framework") ?? "TT133"}>
                <SelectTrigger id="statement-framework">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="TT133">TT133</SelectItem>
                    <SelectItem value="TT200">TT200</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            {kind === "profit_and_loss" ? (
              <Field>
                <FieldLabel htmlFor="statement-basis">Basis</FieldLabel>
                <Select name="basis" defaultValue={query.get("basis") ?? "accrual"}>
                  <SelectTrigger id="statement-basis">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="accrual">Accrual management</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Dòng tiền được trình bày riêng tại Direct Cash Flow, không thay thế P&amp;L.
                </p>
              </Field>
            ) : null}
            {[
              ["projectId", "Project ID"],
              ["teamId", "Team ID"],
              ["serviceLineCode", "Service line"],
              ["costCenterId", "Cost center"],
            ].map(([name, label]) => (
              <Field key={name}>
                <FieldLabel htmlFor={`statement-${name}`}>{label}</FieldLabel>
                <Input id={`statement-${name}`} name={name} defaultValue={query.get(name) ?? ""} />
              </Field>
            ))}
          </FieldGroup>
          <PopoverFooter className="sticky bottom-0 bg-popover py-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button type="submit">Áp dụng</Button>
          </PopoverFooter>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function SourceDialog({
  report,
  line,
  onClose,
}: Readonly<{
  report?: FinancialStatementReport;
  line?: FinancialStatementLine;
  onClose: () => void;
}>) {
  const { client: api, hydrated, hasToken } = useAuthenticatedApiClient();
  const [data, setData] = useState<FinancialStatementDrilldown>();
  const [error, setError] = useState("");
  useEffect(() => {
    if (!report || !line || !hydrated) return;
    setData(undefined);
    setError("");
    if (!hasToken) {
      setError("AUTH_REQUIRED");
      return;
    }
    const query = new URLSearchParams({
      statement: report.statement,
      lineCode: line.lineCode,
      endsOn: report.range.endsOn,
      asOfInstant: report.asOfInstant,
      framework: report.framework,
      basis: report.basis,
    });
    if (report.range.startsOn) query.set("startsOn", report.range.startsOn);
    api
      .data<FinancialStatementDrilldown>(`${financialStatementsApi.drilldown}?${query}`)
      .then((next) => {
        setData(next);
        setError("");
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Không tải được nguồn"),
      );
  }, [api, hasToken, hydrated, line, report]);
  return (
    <Dialog
      open={Boolean(line)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex max-h-[min(90vh,52rem)] flex-col sm:max-w-4xl">
        <DialogHeader className="border-b pb-4">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl font-bold">
                Chi tiết Nguồn · {line?.label}
              </DialogTitle>
              <DialogDescription className="text-xs mt-1">
                Danh sách bút toán & chứng từ cấu thành nên chỉ số {line?.label} trong kỳ báo cáo.
              </DialogDescription>
            </div>
            {line?.amountMinor ? (
              <div className="text-right">
                <span className="text-xs text-muted-foreground block">Tổng tiền chỉ số:</span>
                <span className="text-lg font-bold text-primary">
                  <MoneyCell minor={line.amountMinor} />
                </span>
              </div>
            ) : null}
          </div>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-2 pr-1">
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Không tải được nguồn</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {data?.items && data.items.length > 0 ? (
            <div className="overflow-hidden">
              <div className="bg-muted/50 px-4 py-2 text-xs font-semibold grid grid-cols-12 gap-2 border-b">
                <span className="col-span-3">TÀI KHOẢN KẾ TOÁN</span>
                <span className="col-span-3">NGÀY & MÃ BÚT TOÁN</span>
                <span className="col-span-3">CHỨNG TỪ NGUỒN</span>
                <span className="col-span-3 text-right">SỐ TIỀN</span>
              </div>
              <div className="divide-y max-h-96 overflow-y-auto">
                {data.items.map((item) => (
                  <div
                    key={`${item.journalId}:${item.lineNumber}`}
                    className="px-4 py-3 text-sm grid grid-cols-12 gap-2 items-center hover:bg-muted/30 transition-colors"
                  >
                    <div className="col-span-3">
                      <p className="font-semibold text-xs text-primary">{item.accountCode}</p>
                      <p className="text-xs text-muted-foreground truncate">{item.accountName}</p>
                    </div>
                    <div className="col-span-3">
                      <p className="text-xs font-mono">{item.journalDate}</p>
                      <p className="text-xs text-muted-foreground font-mono">
                        Journal #{item.journalId}
                      </p>
                    </div>
                    <div className="col-span-3">
                      {item.sourceId ? (
                        <div className="flex flex-col gap-1 items-start">
                          <Badge
                            variant="secondary"
                            className="font-mono text-[10px] px-1.5 py-0.5"
                          >
                            {item.sourceId}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            asChild
                            className="h-6 text-[11px] px-1.5 text-primary"
                          >
                            <Link
                              href={
                                item.sourceId.startsWith("doc-") || item.sourceId.startsWith("inv-")
                                  ? `/documents/${encodeURIComponent(item.sourceId)}`
                                  : `/documents`
                              }
                            >
                              Mở chứng từ <ChevronRight className="size-3 ml-0.5" />
                            </Link>
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">
                          Bút toán trực tiếp
                        </span>
                      )}
                    </div>
                    <div className="col-span-3 text-right">
                      <span className="font-bold text-sm">
                        <MoneyCell minor={item.amountMinor} />
                      </span>
                      <p className="text-[10px] text-muted-foreground">
                        Dòng {item.lineNumber} · v{item.journalVersion}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : !error ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              Đang tải danh sách dòng bút toán chi tiết...
            </div>
          ) : null}

          {line?.sourceLineIds?.length ? (
            <section className="flex flex-col gap-1.5 rounded-lg border bg-muted/20 p-3 mt-2">
              <h4 className="text-xs font-semibold text-muted-foreground">
                DANH SÁCH MÃ CHỨNG TỪ NGUỒN (SOURCE IDS)
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {line.sourceLineIds.map((id) => (
                  <Badge key={id} variant="outline" className="font-mono text-xs bg-background">
                    {id}
                  </Badge>
                ))}
              </div>
            </section>
          ) : null}
        </div>
        <DialogFooter className="border-t pt-3">
          {report?.statement === "vat_reconciliation" &&
          (line?.lineCode === "net_vat_payable" || line?.lineCode === "unreviewed_input_vat") ? (
            <Button variant="default" size="sm" asChild>
              <Link href={vatSourceHref(report)}>
                Xử lý VAT chưa review <ChevronRight className="ml-1 size-3.5" />
              </Link>
            </Button>
          ) : null}
          <DialogClose asChild>
            <Button variant="outline">Đóng cửa sổ</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReportKpis({ report }: Readonly<{ report: FinancialStatementReport }>) {
  const period = report.range.startsOn
    ? `${report.range.startsOn} → ${report.range.endsOn}`
    : `As of ${report.range.endsOn}`;
  const taxReviewHref =
    report.statement === "vat_reconciliation" ? vatSourceHref(report) : taxReviewQueueHref(report);
  if (report.statement === "balance_sheet" && report.equation)
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Tài sản"
          period={period}
          value={<MoneyCell minor={report.equation.assetsMinor} />}
        />
        <KpiCard
          title="Nợ phải trả"
          period={period}
          value={<MoneyCell minor={report.equation.liabilitiesMinor} />}
        />
        <KpiCard
          title="Vốn chủ sở hữu"
          period={period}
          value={<MoneyCell minor={report.equation.equityMinor} />}
        />
        <KpiCard
          title="Chênh lệch"
          period="Assets − Liabilities − Equity"
          value={<MoneyCell minor={report.equation.differenceMinor} />}
        />
      </div>
    );
  if (report.statement === "cash_flow")
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Operating"
          period={period}
          value={<MoneyCell minor={report.operatingCashFlowMinor ?? "0"} />}
        />
        <KpiCard
          title="Investing"
          period={period}
          value={<MoneyCell minor={report.investingCashFlowMinor ?? "0"} />}
        />
        <KpiCard
          title="Financing"
          period={period}
          value={<MoneyCell minor={report.financingCashFlowMinor ?? "0"} />}
        />
        <KpiCard
          title="Net movement"
          period="Opening + movement = closing"
          value={<MoneyCell minor={report.netCashMovementMinor ?? report.totalMinor ?? "0"} />}
        />
      </div>
    );
  if (report.statement === "vat_reconciliation")
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="VAT đầu ra"
          period={period}
          value={<MoneyCell minor={report.totals?.outputVatMinor ?? "0"} />}
        />
        <KpiCard
          title="VAT đầu vào"
          period={period}
          value={<MoneyCell minor={report.totals?.inputVatMinor ?? "0"} />}
        />
        <KpiCard
          title="Input đủ điều kiện"
          period={period}
          value={<MoneyCell minor={report.totals?.eligibleInputVatMinor ?? "0"} />}
        />
        <KpiCard
          title="VAT phải nộp"
          period="Output − eligible input"
          value={<MoneyCell minor={report.totals?.netVatPayableMinor ?? "0"} />}
          footer={
            <Button variant="outline" size="sm" asChild>
              <Link href={taxReviewHref}>
                Mở hàng chờ VAT <ChevronRight className="ml-1 size-3.5" />
              </Link>
            </Button>
          }
        />
      </div>
    );
  const values = new Map(report.lines.map((line) => [line.lineCode, line.amountMinor]));
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        title="Doanh thu"
        period={period}
        value={<MoneyCell minor={values.get("revenue") ?? "0"} />}
      />
      <KpiCard
        title="Gross profit"
        period={period}
        value={<MoneyCell minor={values.get("gross_profit") ?? "0"} />}
      />
      <KpiCard
        title="Operating profit"
        period={period}
        value={<MoneyCell minor={values.get("operating_profit") ?? "0"} />}
      />
      <KpiCard
        title="Net profit"
        period={period}
        value={<MoneyCell minor={values.get("net_profit") ?? report.totalMinor ?? "0"} />}
      />
    </div>
  );
}

export function FinancialStatementWorkspace({
  kind,
  routeValue,
}: Readonly<{ kind: FinancialStatementKind; routeValue?: string }>) {
  const { client: api, hydrated, hasToken } = useAuthenticatedApiClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();

  const query = useMemo(
    () => reportQuery(new URLSearchParams(searchKey), kind, routeValue),
    [kind, routeValue, searchKey],
  );
  const [report, setReport] = useState<FinancialStatementReport>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedLine, setSelectedLine] = useState<FinancialStatementLine>();
  const [vatActionItem, setVatActionItem] =
    useState<NonNullable<FinancialStatementReport["items"]>[number]>();
  const [vatAction, setVatAction] = useState<"resolve-tax-code" | "review-vat">();
  const [vatActionReason, setVatActionReason] = useState("");
  const [vatActionTaxCode, setVatActionTaxCode] = useState("");
  const [vatActionState, setVatActionState] = useState<
    "eligible" | "partially_eligible" | "ineligible"
  >("eligible");
  const [vatActionSaving, setVatActionSaving] = useState(false);
  const loadReport = useCallback(async () => {
    if (!hydrated) return;
    setLoading(true);
    setError("");
    if (!hasToken) {
      setReport(undefined);
      setError("AUTH_REQUIRED");
      setLoading(false);
      return;
    }
    try {
      const raw = await api.data<RawFinancialStatementReport | FinancialStatementReport>(
        `${endpointByKind[kind]}?${query}`,
      );
      setReport(normalizeReport(kind, raw, query));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không tải được báo cáo");
    } finally {
      setLoading(false);
    }
  }, [api, hasToken, hydrated, kind, query]);
  useEffect(() => {
    void loadReport();
  }, [loadReport]);
  const apply = useCallback(
    (form: FormData) => {
      const next = new URLSearchParams();
      for (const [key, value] of form.entries())
        if (String(value).trim()) next.set(key, String(value).trim());
      setFiltersOpen(false);
      router.push(`${pathname}?${next}`);
    },
    [pathname, router],
  );

  async function captureSnapshot() {
    if (!report || capturing) return;
    setCapturing(true);
    try {
      const payload = {
        reportKind: kind,
        period: {
          startsOn: query.get("startsOn") ?? report.range.startsOn,
          endsOn: query.get("endsOn") ?? report.range.endsOn,
          asOfDate:
            query.get("endsOn") ?? report.range.endsOn ?? new Date().toISOString().split("T")[0],
        },
        accountingBasis: report.basis,
        framework: report.framework,
        formulaVersions: { [kind]: report.formulaVersion ?? "1.0" },
        request: Object.fromEntries(query.entries()),
      };
      await api.data<ReportSnapshotContract>("report-snapshots", {
        method: "POST",
        body: payload,
      });
      router.push(`/reports/accountant-exports`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chốt dữ liệu thất bại");
    } finally {
      setCapturing(false);
    }
  }
  async function applyVatAction() {
    if (!vatActionItem || !vatAction || !vatActionReason.trim() || vatActionSaving) return;
    setVatActionSaving(true);
    setError("");
    try {
      if (vatAction === "resolve-tax-code") {
        await api.data(
          `commercial-documents/${encodeURIComponent(vatActionItem.sourceId)}/tax-code`,
          {
            method: "POST",
            body: {
              lineNumber: vatActionItem.lineNumber ?? 1,
              reason: vatActionReason.trim(),
              ...(vatActionTaxCode.trim() ? { taxCode: vatActionTaxCode.trim() } : {}),
            },
          },
        );
      } else {
        const isExpense = vatActionItem.sourceType === "expense";
        await api.data(
          isExpense
            ? `expenses/${encodeURIComponent(vatActionItem.sourceId)}/review`
            : `commercial-documents/${encodeURIComponent(vatActionItem.sourceId)}/review`,
          {
            method: "POST",
            body: {
              axis: "vat",
              lineNumber: vatActionItem.lineNumber ?? 1,
              state: vatActionState,
              eligibleMinor: vatActionState === "ineligible" ? "0" : vatActionItem.taxMinor,
              ...(isExpense
                ? {}
                : { taxCode: vatActionTaxCode.trim() || vatActionItem.taxCode || "VAT10_IN" }),
              reason: vatActionReason.trim(),
            },
          },
        );
      }
      setVatActionItem(undefined);
      setVatAction(undefined);
      setVatActionReason("");
      setVatActionTaxCode("");
      await loadReport();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể xử lý dòng VAT");
    } finally {
      setVatActionSaving(false);
    }
  }
  const columns = useMemo<readonly FinancialColumn<FinancialStatementLine>[]>(
    () => [
      {
        id: "line",
        header: "Chỉ tiêu",
        cell: (line) => (
          <div className="flex flex-col gap-1">
            <span className="font-medium">{line.label}</span>
            <span className="text-xs text-muted-foreground">{line.lineCode}</span>
          </div>
        ),
      },
      {
        id: "amount",
        header: "Số tiền",
        align: "right",
        cell: (line) => <MoneyCell minor={line.amountMinor} />,
      },
      {
        id: "sources",
        header: "Nguồn",
        align: "right",
        cell: (line) => (
          <Button size="sm" variant="outline" onClick={() => setSelectedLine(line)}>
            <Search data-icon="inline-start" />
            Xem nguồn
          </Button>
        ),
      },
    ],
    [],
  );
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <PeriodRangeNavigator />
          <Badge variant="outline">{report?.framework ?? query.get("framework")}</Badge>
          <StatusBadge status={report?.final ? "verified" : "needs_review"} />
          <Badge variant="secondary">
            {kind === "profit_and_loss"
              ? `${report?.basis ?? query.get("basis")} basis`
              : titleByKind[kind]}
          </Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setFiltersOpen(true)}>
            <Filter data-icon="inline-start" />
            Bộ lọc
          </Button>
          {kind === "vat_reconciliation" && report?.status === "review_required" ? (
            <Button variant="outline" asChild>
              <Link href={vatSourceHref(report)}>Mở hàng chờ review VAT</Link>
            </Button>
          ) : null}
          {report && (
            <Button disabled={capturing} onClick={() => void captureSnapshot()}>
              <Camera data-icon="inline-start" />
              {capturing ? "Đang chốt..." : "Chốt dữ liệu"}
            </Button>
          )}
        </div>
      </div>
      {report && (!report.final || report.equation?.balanced === false) ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Báo cáo chưa sẵn sàng</AlertTitle>
          <AlertDescription>
            <div className="flex flex-wrap items-center gap-3">
              <span>
                {report.equation?.balanced === false
                  ? `Balance Sheet lệch ${report.equation.differenceMinor} minor units. Không có hidden plug.`
                  : kind === "vat_reconciliation"
                    ? vatReadinessMessage(report)
                    : "Còn mapping, evidence hoặc reconciliation exception cần xử lý trước khi dùng số liệu như bản final."}
              </span>
              {kind === "vat_reconciliation" ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href={vatSourceHref(report)}>
                    Xử lý VAT chưa review <ChevronRight className="ml-1 size-3.5" />
                  </Link>
                </Button>
              ) : null}
            </div>
          </AlertDescription>
        </Alert>
      ) : null}
      {report ? <ReportKpis report={report} /> : null}
      <Card>
        <CardHeader>
          <CardTitle>{titleByKind[kind]}</CardTitle>
          <CardDescription>
            {report
              ? `${report.range.startsOn ?? "Inception"} → ${report.range.endsOn} · cutoff ${report.asOfInstant}`
              : "Đọc từ posted ledger theo cutoff đã chọn."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FinancialDataTable
            rows={report?.lines ?? []}
            columns={columns}
            rowKey={(line) => line.lineCode}
            loading={loading}
            error={error}
            emptyTitle="Chưa có dòng báo cáo"
            emptyDescription="Hãy duyệt mapping và post journal cho kỳ đã chọn."
          />
        </CardContent>
      </Card>
      {kind === "vat_reconciliation" && report?.items?.length ? (
        <Card id="vat-source-items" className="scroll-mt-6">
          <CardHeader>
            <CardTitle>Chi tiết nguồn VAT</CardTitle>
            <CardDescription>
              Xử lý mã thuế, trạng thái review và chứng từ ngay trên màn hình đối soát này.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y rounded-md border">
              {report.items.map((item) => {
                const invalidCode = item.taxCodeApproved === false;
                const needsReview = item.nextActions?.includes("review-vat");
                const sourceLabel =
                  item.sourceType === "purchase_invoice"
                    ? "Hóa đơn mua vào"
                    : item.sourceType === "purchase_credit_note"
                      ? "Điều chỉnh mua vào"
                      : item.sourceType === "sales_invoice"
                        ? "Hóa đơn bán ra"
                        : item.sourceType === "sales_credit_note"
                          ? "Điều chỉnh bán ra"
                          : "Chi phí";
                const sourceHref =
                  item.sourceType === "expense"
                    ? `/expenses/${encodeURIComponent(item.sourceId)}`
                    : `/documents/${encodeURIComponent(item.sourceId)}`;
                return (
                  <div
                    key={item.id}
                    className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{sourceLabel}</span>
                        <Badge variant="outline">Dòng {item.lineNumber ?? 1}</Badge>
                        <StatusBadge status={item.reviewState ?? "eligible"} />
                        {item.direction === "reversal" ? (
                          <Badge variant="secondary">Đảo</Badge>
                        ) : null}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Nguồn: <span className="font-mono">{item.sourceId}</span>
                        {item.journalId ? ` · Journal ${item.journalId}` : ""}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                        <span>
                          VAT: <MoneyCell minor={item.taxMinor} />
                        </span>
                        <span>
                          Mã thuế: {item.taxCode ?? "Chưa gán"}
                          {invalidCode ? (
                            <span className="ml-1 text-destructive">(chưa được duyệt)</span>
                          ) : null}
                        </span>
                        <span>
                          Chứng từ: {item.presentEvidenceTypes?.length ? "Đã có" : "Thiếu"}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                      {invalidCode && item.sourceType === "purchase_invoice" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setVatActionItem(item);
                            setVatAction("resolve-tax-code");
                            setVatActionTaxCode(item.taxCode ?? "");
                            setVatActionReason(
                              "Bổ sung mã thuế VAT theo chứng từ và chính sách đã duyệt",
                            );
                          }}
                        >
                          Gán mã thuế
                        </Button>
                      ) : null}
                      {needsReview ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setVatActionItem(item);
                            setVatAction("review-vat");
                            setVatActionTaxCode(item.taxCode ?? "");
                            setVatActionState("eligible");
                            setVatActionReason("Xác nhận phân loại VAT theo chứng từ nguồn");
                          }}
                        >
                          Review VAT
                        </Button>
                      ) : null}
                      <Button size="sm" variant="ghost" asChild>
                        <Link href={sourceHref}>
                          Xem nguồn <ChevronRight className="ml-1 size-3.5" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : kind === "vat_reconciliation" && report ? (
        <Card>
          <CardHeader>
            <CardTitle>Chi tiết nguồn VAT</CardTitle>
            <CardDescription>Không có dòng VAT trong khoảng thời gian đã chọn.</CardDescription>
          </CardHeader>
        </Card>
      ) : null}
      {report?.unmappedAccountCodes?.length ? (
        <Alert>
          <AlertTitle>Tài khoản chưa mapping</AlertTitle>
          <AlertDescription>{report.unmappedAccountCodes.join(", ")}</AlertDescription>
        </Alert>
      ) : null}
      <ReportFilterSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        query={query}
        kind={kind}
        onApply={apply}
      />
      <SourceDialog
        report={report}
        line={selectedLine}
        onClose={() => setSelectedLine(undefined)}
      />
      <Dialog
        open={Boolean(vatActionItem)}
        onOpenChange={(open) => {
          if (!open && !vatActionSaving) {
            setVatActionItem(undefined);
            setVatAction(undefined);
            setVatActionTaxCode("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {vatAction === "resolve-tax-code" ? "Gán mã thuế VAT" : "Review VAT"}
            </DialogTitle>
            <DialogDescription>
              {vatActionItem?.sourceId} · dòng {vatActionItem?.lineNumber ?? 1}
            </DialogDescription>
          </DialogHeader>
          {vatAction === "review-vat" ? (
            <Field>
              <FieldLabel>Trạng thái VAT</FieldLabel>
              <Select
                value={vatActionState}
                onValueChange={(value) =>
                  setVatActionState(value as "eligible" | "partially_eligible" | "ineligible")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="eligible">Đủ điều kiện</SelectItem>
                  <SelectItem value="partially_eligible">Đủ một phần</SelectItem>
                  <SelectItem value="ineligible">Không đủ điều kiện</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          ) : null}
          {vatAction === "resolve-tax-code" ? (
            <Field>
              <FieldLabel htmlFor="vat-action-tax-code">Mã số thuế VAT</FieldLabel>
              <Input
                id="vat-action-tax-code"
                value={vatActionTaxCode}
                onChange={(event) => setVatActionTaxCode(event.target.value)}
                placeholder="Ví dụ: VAT8_IN hoặc VAT10_IN"
              />
              <p className="text-xs text-muted-foreground">
                Nhập đúng mã đã được accountant duyệt và còn hiệu lực cho ngày chứng từ.
              </p>
            </Field>
          ) : null}
          <Field>
            <FieldLabel htmlFor="vat-action-reason">Lý do</FieldLabel>
            <Input
              id="vat-action-reason"
              value={vatActionReason}
              onChange={(event) => setVatActionReason(event.target.value)}
            />
          </Field>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Hủy</Button>
            </DialogClose>
            <Button
              onClick={() => void applyVatAction()}
              disabled={
                vatActionSaving ||
                !vatActionReason.trim() ||
                (vatAction === "resolve-tax-code" && !vatActionTaxCode.trim())
              }
            >
              {vatActionSaving ? "Đang lưu…" : "Xác nhận"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const fallbackTaxExceptions: readonly TaxExpenseException[] = [
  {
    id: "exp-salary-01",
    expenseId: "exp-salary-01",
    description: "Chi trả lương nhân viên & trợ cấp tháng 8/2026 (Chi phí không hóa đơn GTGT)",
    expenseDate: "2026-08-05",
    partyName: "Bảng lương Công ty",
    bookedMinor: "20000000",
    citEligibleMinor: "20000000",
    citIneligibleMinor: "0",
    citState: "eligible",
    vatEligibleMinor: "0",
    vatIneligibleMinor: "0",
    vatState: "ineligible",
    evidenceState: "verified",
    reason: "Chi phí lương nhân viên theo bảng lương; không thuộc đối tượng xuất hóa đơn GTGT.",
    sourceIds: ["payroll:2026-08"],
  },
  {
    id: "exp-salary-02",
    expenseId: "exp-salary-02",
    description: "Chi trả lương & thưởng dự án (Chủ sở hữu chi hộ vượt 90tr rút)",
    expenseDate: "2026-08-06",
    partyName: "Chủ sở hữu chi hộ (TK 3388)",
    bookedMinor: "5000000",
    citEligibleMinor: "5000000",
    citIneligibleMinor: "0",
    citState: "eligible",
    vatEligibleMinor: "0",
    vatIneligibleMinor: "0",
    vatState: "ineligible",
    evidenceState: "verified",
    reason: "Chi phí nhân sự do chủ sở hữu chi hộ từ tiền cá nhân vượt số tiền rút ngân hàng.",
    sourceIds: ["owner_loan:3388"],
  },
  {
    id: "exp-cash-03",
    expenseId: "exp-cash-03",
    description: "Chi phí gửi xe & mua đồ dùng nhỏ lẻ chưa có hóa đơn GTGT",
    expenseDate: "2026-08-02",
    partyName: "Chi lẻ tiền mặt",
    bookedMinor: "1500000",
    citEligibleMinor: "0",
    citIneligibleMinor: "1500000",
    citState: "review",
    vatEligibleMinor: "0",
    vatIneligibleMinor: "0",
    vatState: "ineligible",
    evidenceState: "missing",
    reason: "Khoản chi tiền mặt nhỏ lẻ chưa bổ sung bảng kê chứng từ hợp lệ.",
    sourceIds: ["cash:petty"],
  },
];

export function TaxExpenseExceptionsWorkspace() {
  const { client: api, hydrated, hasToken } = useAuthenticatedApiClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const [rows, setRows] = useState<readonly TaxExpenseException[]>(fallbackTaxExceptions);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [finalizeReason, setFinalizeReason] = useState(
    "AI audit: xác nhận và hoàn tất phân loại CIT/VAT theo chính sách doanh nghiệp",
  );
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeNotice, setFinalizeNotice] = useState("");
  const [reviewRow, setReviewRow] = useState<TaxExpenseException | null>(null);
  const [reviewAxis, setReviewAxis] = useState<"cit" | "vat">("cit");
  const [reviewTaxCode, setReviewTaxCode] = useState("VAT10_IN");
  const [taxCodeRow, setTaxCodeRow] = useState<TaxExpenseException | null>(null);
  const [taxCodeReason, setTaxCodeReason] = useState("Gán mã VAT đầu vào đã được kiểm tra");
  const [taxCodeValue, setTaxCodeValue] = useState("");
  const [taxCodeSaving, setTaxCodeSaving] = useState(false);
  const [reviewState, setReviewState] = useState<"eligible" | "partially_eligible" | "ineligible">(
    "eligible",
  );
  const [reviewAmount, setReviewAmount] = useState("0");
  const [reviewReason, setReviewReason] = useState(
    "AI audit: xác nhận phân loại CIT theo chứng từ đầu vào",
  );
  const [reviewing, setReviewing] = useState(false);
  const query = useMemo(() => {
    const q = new URLSearchParams(searchKey);
    const end = q.get("endsOn") ?? q.get("to") ?? today();
    const start = q.get("startsOn") ?? q.get("from") ?? `${end.substring(0, 4)}-01-01`;
    if (!q.has("startsOn")) q.set("startsOn", start);
    if (!q.has("endsOn")) q.set("endsOn", end);
    if (!q.has("asOfInstant")) q.set("asOfInstant", `${end}T16:59:59.999Z`);
    if (!q.has("framework")) q.set("framework", "TT133");
    if (!q.has("state")) q.set("state", "unreviewed");
    return q;
  }, [searchKey]);
  useEffect(() => {
    if (!hydrated) return;
    setLoading(true);
    setError("");
    if (!hasToken) {
      setRows(fallbackTaxExceptions);
      setLoading(false);
      return;
    }
    api
      .data<RawTaxExpenseReview | { items: readonly TaxExpenseException[] }>(
        `${financialStatementsApi.expenseExceptions}?${query}`,
      )
      .then((data) => {
        const items = data.items.map((item) => normalizeTaxException(item));
        // An authenticated, successful response with no items is a truthful empty queue;
        // never replace it with development/demo rows.
        setRows(items);
        setError("");
      })
      .catch((reason: unknown) => {
        setRows([]);
        setError(reason instanceof Error ? reason.message : "Không tải được hàng chờ rà soát");
      })
      .finally(() => setLoading(false));
  }, [api, hasToken, hydrated, query]);
  const columns = useMemo<readonly FinancialColumn<TaxExpenseException>[]>(
    () => [
      {
        id: "expense",
        header: "Chi phí",
        cell: (row) => (
          <div className="flex flex-col gap-1">
            <span className="font-medium">{row.description}</span>
            <span className="text-xs text-muted-foreground">
              {row.expenseDate} · {row.partyName ?? row.expenseId}
            </span>
          </div>
        ),
      },
      {
        id: "booked",
        header: "Đã book",
        align: "right",
        cell: (row) => <MoneyCell minor={row.bookedMinor} />,
      },
      {
        id: "cit",
        header: "CIT deductible",
        align: "right",
        cell: (row) => (
          <div className="flex flex-col items-end gap-1">
            <MoneyCell minor={row.citEligibleMinor} />
            <StatusBadge status={row.citState} />
          </div>
        ),
      },
      {
        id: "vat",
        header: "VAT eligible",
        align: "right",
        cell: (row) => (
          <div className="flex flex-col items-end gap-1">
            <MoneyCell minor={row.vatEligibleMinor} />
            <StatusBadge status={row.vatState} />
            {row.taxCodeApproved === false ? (
              <span className="text-[11px] text-destructive">
                {row.taxCode ? `Mã ${row.taxCode} chưa được duyệt` : "Thiếu mã thuế VAT"}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        id: "action",
        header: "",
        align: "right",
        cell: (row) => {
          const isDoc = row.sourceType === "purchase_invoice";
          const targetHref = isDoc
            ? `/documents/${encodeURIComponent(row.expenseId)}`
            : row.expenseId
              ? `/expenses/${encodeURIComponent(row.expenseId)}`
              : `/expenses`;
          const canReview =
            row.nextActions?.includes("review-cit") ||
            row.citState === "unreviewed" ||
            row.citState === "review";
          const canReviewVat =
            row.nextActions?.includes("review-vat") || row.vatState === "unreviewed";
          const canResolveTaxCode =
            row.nextActions?.includes("resolve-tax-code") || row.taxCodeApproved === false;
          return (
            <div className="flex items-center justify-end gap-1">
              {canReview ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setReviewRow(row);
                    setReviewAxis("cit");
                    setReviewTaxCode("VAT10_IN");
                    setReviewState("eligible");
                    setReviewAmount(row.bookedMinor);
                    setReviewReason("AI audit: xác nhận phân loại CIT theo chứng từ đầu vào");
                  }}
                >
                  Review CIT
                </Button>
              ) : null}
              {canReviewVat ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setReviewRow(row);
                    setReviewAxis("vat");
                    setReviewTaxCode("VAT10_IN");
                    setReviewState("eligible");
                    setReviewAmount(row.vatBasisMinor ?? row.vatEligibleMinor ?? "0");
                    setReviewReason("AI audit: xác nhận phân loại VAT theo chứng từ đầu vào");
                  }}
                >
                  Review VAT
                </Button>
              ) : null}
              {canResolveTaxCode && row.sourceType === "purchase_invoice" ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setTaxCodeRow(row);
                    setTaxCodeValue(row.taxCode ?? "");
                  }}
                >
                  Gán mã thuế
                </Button>
              ) : null}
              <Button variant="ghost" size="sm" asChild>
                <Link href={targetHref}>
                  Xem chi tiết <ChevronRight className="size-3.5 ml-0.5" />
                </Link>
              </Button>
            </div>
          );
        },
      },
    ],
    [],
  );
  const apply = useCallback(
    (form: FormData) => {
      const next = new URLSearchParams();
      for (const [key, value] of form.entries())
        if (String(value).trim()) next.set(key, String(value).trim());
      setFiltersOpen(false);
      router.push(`${pathname}?${next}`);
    },
    [pathname, router],
  );

  async function finalizeReview() {
    if (!hasToken || !finalizeReason.trim() || finalizing) return;
    setFinalizing(true);
    setFinalizeNotice("");
    try {
      const dryRun = await api.data<{ planHash: string; lineCount: number }>(
        "expenses/tax-finalization/dry-run",
        { method: "POST", body: { reason: finalizeReason.trim() } },
      );
      await api.data<{ lineCount: number }>("expenses/tax-finalization/commit", {
        method: "POST",
        body: { reason: finalizeReason.trim(), planHash: dryRun.planHash },
      });
      setFinalizeNotice(`Đã hoàn tất review ${dryRun.lineCount} dòng. Đang tải lại dữ liệu…`);
      setFinalizeOpen(false);
      const refreshed = await api.data<
        RawTaxExpenseReview | { items: readonly TaxExpenseException[] }
      >(`${financialStatementsApi.expenseExceptions}?${query}`);
      const items = refreshed.items.map((item) => normalizeTaxException(item));
      setRows(items);
    } catch (e) {
      setFinalizeNotice(e instanceof Error ? e.message : "Không thể hoàn tất review");
    } finally {
      setFinalizing(false);
    }
  }
  async function reviewCit() {
    if (!reviewRow || !reviewReason.trim() || reviewing || !hasToken) return;
    setReviewing(true);
    try {
      const endpoint =
        reviewRow.sourceType === "purchase_invoice"
          ? `commercial-documents/${encodeURIComponent(reviewRow.expenseId)}/review`
          : `expenses/${encodeURIComponent(reviewRow.expenseId)}/review`;
      await api.data(endpoint, {
        method: "POST",
        body: {
          axis: reviewAxis,
          lineNumber: reviewRow.lineNumber ?? 1,
          state: reviewState,
          eligibleMinor: reviewState === "ineligible" ? "0" : reviewAmount,
          ...(reviewAxis === "vat" ? { taxCode: reviewTaxCode } : {}),
          reason: reviewReason.trim(),
        },
      });
      setReviewRow(null);
      const refreshed = await api.data<
        RawTaxExpenseReview | { items: readonly TaxExpenseException[] }
      >(`${financialStatementsApi.expenseExceptions}?${query}`);
      setRows(refreshed.items.map((item) => normalizeTaxException(item)));
    } catch (e) {
      setFinalizeNotice(
        e instanceof Error ? e.message : `Không thể review ${reviewAxis.toUpperCase()}`,
      );
    } finally {
      setReviewing(false);
    }
  }
  async function resolveTaxCode() {
    if (!taxCodeRow || !taxCodeReason.trim() || taxCodeSaving || !hasToken) return;
    setTaxCodeSaving(true);
    try {
      await api.data(`commercial-documents/${encodeURIComponent(taxCodeRow.expenseId)}/tax-code`, {
        method: "POST",
        body: {
          lineNumber: taxCodeRow.lineNumber ?? 1,
          reason: taxCodeReason.trim(),
          ...(taxCodeValue.trim() ? { taxCode: taxCodeValue.trim() } : {}),
        },
      });
      setTaxCodeRow(null);
      setTaxCodeValue("");
      const refreshed = await api.data<
        RawTaxExpenseReview | { items: readonly TaxExpenseException[] }
      >(`${financialStatementsApi.expenseExceptions}?${query}`);
      setRows(refreshed.items.map((item) => normalizeTaxException(item)));
    } catch (e) {
      setFinalizeNotice(e instanceof Error ? e.message : "Không thể gán mã thuế VAT");
    } finally {
      setTaxCodeSaving(false);
    }
  }
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex items-center justify-end gap-2">
        {finalizeNotice ? (
          <span className="text-sm text-muted-foreground">{finalizeNotice}</span>
        ) : null}
        <Button
          variant="default"
          onClick={() => setFinalizeOpen(true)}
          disabled={!hasToken || loading || !rows.length}
        >
          Hoàn tất review tự động
        </Button>
        <Button variant="outline" onClick={() => setFiltersOpen(true)}>
          <Filter data-icon="inline-start" />
          Bộ lọc
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Chi phí cần rà soát thuế</CardTitle>
          <CardDescription>
            Accounting booked, CIT và VAT là ba trục độc lập; queue không tự kết luận eligibility.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FinancialDataTable
            rows={rows}
            columns={columns}
            rowKey={(row) => row.id}
            loading={loading}
            error={error}
            emptyTitle="Không có exception"
            emptyDescription="Không còn chi phí vượt filter cần rà soát."
          />
        </CardContent>
      </Card>
      <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
        <PopoverActiveAnchor open={Boolean(filtersOpen)} />
        <PopoverContent
          align="end"
          sideOffset={8}
          className="max-h-[min(80vh,40rem)] w-[min(92vw,30rem)] overflow-y-auto"
        >
          <form action={apply} className="flex flex-col">
            <PopoverHeader>
              <PopoverTitle>Bộ lọc tax exception</PopoverTitle>
              <PopoverDescription>
                Lọc theo trạng thái review, evidence và khoảng ngày.
              </PopoverDescription>
            </PopoverHeader>
            <FieldGroup className="px-4">
              <Field>
                <FieldLabel htmlFor="tax-from">Từ ngày</FieldLabel>
                <Input
                  id="tax-from"
                  name="startsOn"
                  type="date"
                  defaultValue={query.get("startsOn") ?? monthStart()}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="tax-to">Đến ngày</FieldLabel>
                <Input
                  id="tax-to"
                  name="endsOn"
                  type="date"
                  defaultValue={query.get("endsOn") ?? today()}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="tax-state">Review state</FieldLabel>
                <Select name="state" defaultValue={query.get("state") ?? "all"}>
                  <SelectTrigger id="tax-state">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="all">Tất cả exception</SelectItem>
                      <SelectItem value="unreviewed">Chưa review</SelectItem>
                      <SelectItem value="ineligible">Không đủ điều kiện</SelectItem>
                      <SelectItem value="partially_eligible">Đủ điều kiện một phần</SelectItem>
                      <SelectItem value="accountant_override">Accountant override</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>
            <PopoverFooter className="sticky bottom-0 bg-popover py-2">
              <Button type="button" variant="outline" onClick={() => setFiltersOpen(false)}>
                Hủy
              </Button>
              <Button type="submit">Áp dụng</Button>
            </PopoverFooter>
          </form>
        </PopoverContent>
      </Popover>
      <Dialog open={finalizeOpen} onOpenChange={setFinalizeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hoàn tất review chi phí thuế?</DialogTitle>
            <DialogDescription>
              Backend sẽ chạy dry-run, sau đó cập nhật các dòng còn chờ review trong một giao dịch
              có audit và idempotency. Lịch sử journal không bị sửa.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="tax-finalize-reason">Lý do</FieldLabel>
            <Input
              id="tax-finalize-reason"
              value={finalizeReason}
              onChange={(event) => setFinalizeReason(event.target.value)}
            />
          </Field>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Hủy</Button>
            </DialogClose>
            <Button
              onClick={() => void finalizeReview()}
              disabled={finalizing || !finalizeReason.trim()}
            >
              {finalizing ? "Đang xử lý…" : "Xác nhận hoàn tất"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(reviewRow)}
        onOpenChange={(open) => {
          if (!open && !reviewing) setReviewRow(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review {reviewAxis === "vat" ? "VAT" : "CIT"} từng khoản</DialogTitle>
            <DialogDescription>
              {reviewRow?.description} ·{" "}
              {reviewRow ? <MoneyCell minor={reviewRow.bookedMinor} /> : null}
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel>Trạng thái {reviewAxis === "vat" ? "VAT" : "CIT"}</FieldLabel>
            <Select
              value={reviewState}
              onValueChange={(value) => setReviewState(value as typeof reviewState)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="eligible">Đủ điều kiện</SelectItem>
                <SelectItem value="partially_eligible">Đủ một phần</SelectItem>
                <SelectItem value="ineligible">Không đủ điều kiện</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {reviewState !== "ineligible" ? (
            <Field>
              <FieldLabel htmlFor="cit-review-amount">
                Số tiền được tính {reviewAxis === "vat" ? "VAT" : "CIT"}
              </FieldLabel>
              <Input
                id="cit-review-amount"
                inputMode="numeric"
                value={reviewAmount}
                onChange={(e) => setReviewAmount(e.target.value)}
              />
            </Field>
          ) : null}
          {reviewAxis === "vat" ? (
            <Field>
              <FieldLabel htmlFor="vat-review-tax-code">Mã thuế VAT</FieldLabel>
              <Select value={reviewTaxCode} onValueChange={setReviewTaxCode}>
                <SelectTrigger id="vat-review-tax-code">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="VAT10_IN">VAT đầu vào 10%</SelectItem>
                  <SelectItem value="VAT10_OUT">VAT đầu ra 10%</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          ) : null}
          <Field>
            <FieldLabel htmlFor="cit-review-reason">Lý do</FieldLabel>
            <Input
              id="cit-review-reason"
              value={reviewReason}
              onChange={(e) => setReviewReason(e.target.value)}
            />
          </Field>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Hủy</Button>
            </DialogClose>
            <Button onClick={() => void reviewCit()} disabled={reviewing || !reviewReason.trim()}>
              {reviewing ? "Đang lưu…" : "Xác nhận review"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(taxCodeRow)}
        onOpenChange={(open) => {
          if (!open && !taxCodeSaving) {
            setTaxCodeRow(null);
            setTaxCodeValue("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gán mã thuế VAT</DialogTitle>
            <DialogDescription>
              {taxCodeRow?.description} ·{" "}
              {taxCodeRow?.taxCode ? `Mã hiện tại: ${taxCodeRow.taxCode}` : "Chưa có mã thuế"}
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="tax-code-value">Mã số thuế VAT</FieldLabel>
            <Input
              id="tax-code-value"
              value={taxCodeValue}
              onChange={(e) => setTaxCodeValue(e.target.value)}
              placeholder="Ví dụ: VAT8_IN hoặc VAT10_IN"
            />
            <p className="text-xs text-muted-foreground">
              Bắt buộc nhập mã đã được accountant duyệt và đúng loại/thuế suất chứng từ.
            </p>
          </Field>
          <p className="text-sm text-muted-foreground">
            Backend sẽ chọn mã VAT đầu vào đang được duyệt và ghi audit; không thay đổi số tiền hay
            journal đã post.
          </p>
          <Field>
            <FieldLabel htmlFor="tax-code-reason">Lý do</FieldLabel>
            <Input
              id="tax-code-reason"
              value={taxCodeReason}
              onChange={(e) => setTaxCodeReason(e.target.value)}
            />
          </Field>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Hủy</Button>
            </DialogClose>
            <Button
              onClick={() => void resolveTaxCode()}
              disabled={taxCodeSaving || !taxCodeReason.trim() || !taxCodeValue.trim()}
            >
              {taxCodeSaving ? "Đang lưu…" : "Gán mã thuế"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
