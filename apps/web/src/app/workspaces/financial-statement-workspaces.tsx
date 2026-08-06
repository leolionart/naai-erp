"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Filter, Search } from "lucide-react";
import {
  FinancialDataTable,
  type FinancialColumn,
} from "@/components/financial/financial-data-table";
import { KpiCard } from "@/components/financial/kpi-card";
import { MoneyCell } from "@/components/financial/money-cell";
import { StatusBadge } from "@/components/financial/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
        differenceMinor: (
          BigInt(raw.outputDifferenceMinor) + BigInt(raw.inputDifferenceMinor)
        ).toString(),
      },
    };
  }
  throw new Error("API trả về contract báo cáo không phù hợp với route");
}

function normalizeTaxException(value: unknown): TaxExpenseException {
  const item = value as Record<string, unknown>;
  if ("bookedMinor" in item) return item as TaxExpenseException;
  const source = (item.sourceIds ?? {}) as Record<string, unknown>;
  const evidence = Array.isArray(item.evidence) ? item.evidence : [];
  return {
    id: String(item.id ?? `${item.expense_id ?? "expense"}:${item.line_number ?? "line"}`),
    expenseId: String(item.expense_id ?? source.expenseId ?? ""),
    expenseDate: String(item.expense_date ?? ""),
    description: String(item.description ?? "Chi phí cần rà soát"),
    ...(item.party_name ? { partyName: String(item.party_name) } : {}),
    bookedMinor: String(item.booked_gross_minor ?? "0"),
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
    evidenceState: evidence.length ? "verified" : "missing",
    ...(item.reviewed_by ? { reviewer: String(item.reviewed_by) } : {}),
    ...(item.review_reason ? { reason: String(item.review_reason) } : {}),
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
  const endsOn = searchParams.get("endsOn") ?? routeAsOf ?? routeRange?.endsOn ?? today();
  if (kind !== "balance_sheet")
    query.set("startsOn", searchParams.get("startsOn") ?? routeRange?.startsOn ?? monthStart());
  query.set("endsOn", endsOn);
  query.set("asOfInstant", searchParams.get("asOfInstant") ?? `${endsOn}T16:59:59.999Z`);
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <form action={onApply} className="flex h-full min-h-0 flex-col">
          <SheetHeader>
            <SheetTitle>Bộ lọc báo cáo</SheetTitle>
            <SheetDescription>
              Kỳ, cutoff, framework và dimensions được lưu trên URL.
            </SheetDescription>
          </SheetHeader>
          <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
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
          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button type="submit">Áp dụng</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function SourceDrawer({
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
    <Drawer
      direction="right"
      open={Boolean(line)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Nguồn · {line?.label}</DrawerTitle>
          <DrawerDescription>
            Journal, document/expense source IDs từ cùng cutoff và mapping version của báo cáo.
          </DrawerDescription>
        </DrawerHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Không tải được nguồn</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {line?.sourceLineIds?.length ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Source IDs</h3>
              <div className="flex flex-wrap gap-2">
                {line.sourceLineIds.map((id) => (
                  <Badge key={id} variant="outline" className="max-w-full break-all">
                    {id}
                  </Badge>
                ))}
              </div>
            </section>
          ) : null}
          {data?.items.map((item) => (
            <Card key={`${item.journalId}:${item.lineNumber}`}>
              <CardHeader>
                <CardTitle>
                  {item.accountCode} · {item.accountName}
                </CardTitle>
                <CardDescription>
                  {item.journalDate} · Journal {item.journalId}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                <MoneyCell minor={item.amountMinor} />
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">Line {item.lineNumber}</Badge>
                  <Badge variant="outline">v{item.journalVersion}</Badge>
                  {item.sourceId ? <Badge variant="outline">{item.sourceId}</Badge> : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <DrawerFooter>
          <DrawerClose asChild>
            <Button variant="outline">Đóng</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

function ReportKpis({ report }: Readonly<{ report: FinancialStatementReport }>) {
  const period = report.range.startsOn
    ? `${report.range.startsOn} → ${report.range.endsOn}`
    : `As of ${report.range.endsOn}`;
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedLine, setSelectedLine] = useState<FinancialStatementLine>();
  useEffect(() => {
    if (!hydrated) return;
    setLoading(true);
    setError("");
    if (!hasToken) {
      setReport(undefined);
      setError("AUTH_REQUIRED");
      setLoading(false);
      return;
    }
    api
      .data<RawFinancialStatementReport | FinancialStatementReport>(
        `${endpointByKind[kind]}?${query}`,
      )
      .then((raw) => {
        setReport(normalizeReport(kind, raw, query));
        setError("");
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Không tải được báo cáo"),
      )
      .finally(() => setLoading(false));
  }, [api, hasToken, hydrated, kind, query]);
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
          <Badge variant="outline">{report?.framework ?? query.get("framework")}</Badge>
          <StatusBadge status={report?.final ? "verified" : "needs_review"} />
          <Badge variant="secondary">
            {kind === "profit_and_loss"
              ? `${report?.basis ?? query.get("basis")} basis`
              : titleByKind[kind]}
          </Badge>
        </div>
        <Button variant="outline" onClick={() => setFiltersOpen(true)}>
          <Filter data-icon="inline-start" />
          Bộ lọc
        </Button>
      </div>
      {report && (!report.final || report.equation?.balanced === false) ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Báo cáo chưa sẵn sàng</AlertTitle>
          <AlertDescription>
            {report.equation?.balanced === false
              ? `Balance Sheet lệch ${report.equation.differenceMinor} minor units. Không có hidden plug.`
              : "Còn mapping, evidence hoặc reconciliation exception cần xử lý trước khi dùng số liệu như bản final."}
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
      <SourceDrawer
        report={report}
        line={selectedLine}
        onClose={() => setSelectedLine(undefined)}
      />
    </div>
  );
}

export function TaxExpenseExceptionsWorkspace() {
  const { client: api, hydrated, hasToken } = useAuthenticatedApiClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const [rows, setRows] = useState<readonly TaxExpenseException[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const query = useMemo(() => new URLSearchParams(searchKey), [searchKey]);
  useEffect(() => {
    if (!hydrated) return;
    setLoading(true);
    setError("");
    if (!hasToken) {
      setRows([]);
      setError("AUTH_REQUIRED");
      setLoading(false);
      return;
    }
    api
      .data<RawTaxExpenseReview | { items: readonly TaxExpenseException[] }>(
        `${financialStatementsApi.expenseExceptions}?${query}`,
      )
      .then((data) => {
        setRows(data.items.map((item) => normalizeTaxException(item)));
        setError("");
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Không tải được queue"),
      )
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
          <div className="flex flex-col gap-1">
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
          <div className="flex flex-col gap-1">
            <MoneyCell minor={row.vatEligibleMinor} />
            <StatusBadge status={row.vatState} />
          </div>
        ),
      },
      {
        id: "evidence",
        header: "Chứng từ",
        cell: (row) => (
          <div className="flex flex-col gap-1">
            <StatusBadge status={row.evidenceState} />
            {row.reason ? (
              <span className="text-xs text-muted-foreground">{row.reason}</span>
            ) : null}
          </div>
        ),
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
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex justify-end">
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
      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent>
          <form action={apply} className="flex h-full flex-col">
            <SheetHeader>
              <SheetTitle>Bộ lọc tax exception</SheetTitle>
              <SheetDescription>
                Lọc theo trạng thái review, evidence và khoảng ngày.
              </SheetDescription>
            </SheetHeader>
            <FieldGroup className="flex-1 overflow-y-auto px-4">
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
            <SheetFooter>
              <Button type="button" variant="outline" onClick={() => setFiltersOpen(false)}>
                Hủy
              </Button>
              <Button type="submit">Áp dụng</Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
