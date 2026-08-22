"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useState } from "react";
import type {
  AgingReportContract,
  ExecutiveMetricsContract,
  PerformanceComparisonContract,
  ProfitAndLossContract,
  TaxExpenseReviewContract,
  VatReconciliationContract,
} from "@naai-erp/contracts";
import {
  Activity,
  ArrowRight,
  BriefcaseBusiness,
  CircleAlert,
  Filter,
  ListChecks,
  Users,
} from "lucide-react";
import type { ProjectProfitabilityReport } from "@/lib/api/project-profitability";
import { ModulePage } from "@/components/layout/module-page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { PeriodRangeNavigator } from "@/components/layout/period-range-navigator";
import { useAuthenticatedApiClient } from "@/lib/api";
import { ExpenseOverviewChart } from "@/components/dashboard/expense-overview-chart";
import { StatusBadge } from "@/components/financial/status-badge";
import { cn } from "@/lib/utils";
import { Area, AreaChart } from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";

const ExecutiveTrendChart = dynamic(() => import("@/components/dashboard/executive-trend-chart"), {
  loading: () => <Skeleton className="h-48 w-full" />,
  ssr: false,
});

type DashboardData = Readonly<{
  executive?: ExecutiveMetricsContract;
  performance?: PerformanceComparisonContract;
  projects?: ProjectProfitabilityReport;
  aging?: AgingReportContract;
  profitAndLoss?: ProfitAndLossContract;
  taxExpenses?: TaxExpenseReviewContract;
  vat?: VatReconciliationContract;
  operating?: OperatingDashboardWire;
  actualSummary?: ActualFactSummaryWire;
  failures?: Readonly<
    Record<
      | "executive"
      | "performance"
      | "projects"
      | "aging"
      | "profitAndLoss"
      | "taxExpenses"
      | "vat"
      | "operating"
      | "actualSummary",
      string
    >
  >;
  searchKey?: string;
}>;
type ActualFactSummaryWire = Readonly<{
  actualBasis: "recognized" | "invoiced" | "collected";
  from: string;
  to: string;
  currency: string;
  amountMinor: string;
  factCount: number;
  sourceIds: readonly string[];
}>;
type SourceControlMonthlyWire = Readonly<{
  id: string;
  kind: "profitability_control" | "planning_control";
  period: string;
  revenueMinor: string;
  receivedMinor: string;
  expenseMinor: string;
  profitMinor: string;
}>;
type OperatingProjectWire = Readonly<{
  projectId?: string;
  code?: string;
  name?: string;
  clientName?: string;
  state?: string;
  startsOn?: string;
  endsOn?: string | null;
  contractedMinor?: string;
  invoicedMinor?: string;
  actualCostMinor?: string;
  budgetCostMinor?: string;
  burnBps?: number | null;
  estimateAtCompletionMinor?: string;
  eacMethod?: string;
  backlogMinor?: string;
}>;
type OperatingClientWire = Readonly<{
  clientId?: string;
  clientName?: string;
  revenueMinor?: string;
  invoiceCount?: number;
}>;
type OperatingDashboardWire = Readonly<{
  schemaVersion: 1;
  asOf: string;
  currency: string;
  backlog: Readonly<{
    projectCount: number;
    contractedMinor: string;
    invoicedMinor: string;
    remainingMinor: string;
    projects: readonly OperatingProjectWire[];
  }>;
  collections: Readonly<{
    receivablesMinor: string;
    creditSalesMinor: string;
    dsoDays: number | null;
    overdueMinor: string;
    dueWithin7DaysMinor: string;
    dueWithin30DaysMinor: string;
    laterMinor: string;
  }>;
  projectBurn: readonly OperatingProjectWire[];
  clientConcentration: Readonly<{
    totalRevenueMinor: string;
    topClientShareBps: number | null;
    topThreeShareBps: number | null;
    clients: readonly OperatingClientWire[];
  }>;
  financials: Readonly<{
    revenueMinor: string;
    expenseMinor: string;
    netProfitMinor: string;
    unrestrictedCashMinor: string | null;
    bankAvailableMinor: string;
    cashOnHandMinor: string;
    cashAndBankMinor: string;
    ownerPayableMinor: string;
    companyOwesOwnerMinor?: string;
    ownerHoldsCompanyFundsMinor?: string;
    statutoryOwnerCurrentBalanceMinor?: string;
    ownerOperatingPayableMinor?: string;
    netAvailableCashMinor: string;
    actualOwnerPaidCompanyCostMinor?: string;
    netCompanyFundsMinor?: string;
    ownerPaidClassificationStatus?: "ready" | "review_required" | "unconfigured";
    unclassifiedOwnerPaidCount?: number;
    unclassifiedOwnerPaidMinor?: string;
    corporateIncomeTaxRateBps: number | null;
    rosBps: number | null;
    recognitionEventCount: number;
    approvedBudgetCount: number;
    postedOverheadRunCount: number;
    source: "posted_ledger";
    monthly?: readonly Readonly<{
      period: string;
      revenueMinor: string;
      expenseMinor: string;
    }>[];
  }>;
  dataQuality: Readonly<{
    pendingCount: number;
    byFlag: readonly Readonly<{ flag: string; count: number }>[];
    rows: readonly Record<string, unknown>[];
  }>;
  sourceControls?: Readonly<{
    accountingStatus: "unconfirmed_non_canonical";
    rowCount: number;
    byKind: readonly Readonly<{ kind: string; count: number }>[];
    monthly: readonly SourceControlMonthlyWire[];
    expenseCategories?: readonly Readonly<{
      id: string;
      category: string;
      monthlyAmounts: readonly Readonly<{ period: string; amountMinor: string }>[];
    }>[];
  }>;
}>;
type Preview = Readonly<{
  title: string;
  description: string;
  sourceIds: readonly string[];
  href: string;
  facts?: readonly Readonly<{ label: string; value: string }>[];
}>;

const currentMonth = () => new Date().toISOString().slice(0, 7);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const monthEnd = (month: string) => {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
};

export function ownerSettlementDashboardAmounts(financials?: {
  ownerPayableMinor?: string;
  companyOwesOwnerMinor?: string;
  ownerHoldsCompanyFundsMinor?: string;
}) {
  const companyOwesOwner = BigInt(
    financials?.companyOwesOwnerMinor ?? financials?.ownerPayableMinor ?? "0",
  );
  const ownerHoldsCompanyFunds = BigInt(financials?.ownerHoldsCompanyFundsMinor ?? "0");
  return {
    companyOwesOwnerMinor: (companyOwesOwner > 0n ? companyOwesOwner : 0n).toString(),
    ownerHoldsCompanyFundsMinor: (ownerHoldsCompanyFunds > 0n
      ? ownerHoldsCompanyFunds
      : 0n
    ).toString(),
  };
}

export function shouldShowNetCompanyFunds(companyOwesOwnerMinor: string) {
  return BigInt(companyOwesOwnerMinor) > 0n;
}
type PeriodKind = "month" | "quarter" | "year";

function periodRange(anchorMonth: string, kind: PeriodKind) {
  const [year, month] = anchorMonth.split("-").map(Number);
  if (kind === "year")
    return { label: String(year), startsOn: `${year}-01-01`, endsOn: `${year}-12-31` };
  if (kind === "quarter") {
    const quarter = Math.floor((month - 1) / 3) + 1;
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

export function resolvedDashboardSearch(
  input: URLSearchParams,
  sourceControls?: OperatingDashboardWire["sourceControls"],
) {
  const search = new URLSearchParams(input);
  const requestedPeriod = search.get("periodId");
  const periodMatch = /^(?:CAL-)?(\d{4}-(?:0[1-9]|1[0-2]))$/.exec(
    requestedPeriod ?? currentMonth(),
  );
  const latestSourcePeriod = sourceControls?.monthly
    .map((row) => row.period)
    .filter((value) => /^\d{4}-(?:0[1-9]|1[0-2])$/.test(value))
    .sort()
    .at(-1);
  const period = requestedPeriod
    ? (periodMatch?.[1] ?? currentMonth())
    : (latestSourcePeriod ?? currentMonth());
  if (!periodMatch || !requestedPeriod) search.set("periodId", `CAL-${period}`);
  if (!search.has("actualBasis")) search.set("actualBasis", "invoiced");

  const kind = (search.get("periodKind") as PeriodKind | null) ?? "year";
  if (!search.has("periodKind")) search.set("periodKind", kind);

  // Use startsOn/endsOn from URL (set by PeriodRangeNavigator) when present,
  // otherwise compute from period + kind.
  const existingStartsOn = search.get("startsOn");
  const existingEndsOn = search.get("endsOn");
  const hasExplicitRange =
    existingStartsOn &&
    existingEndsOn &&
    ISO_DATE.test(existingStartsOn) &&
    ISO_DATE.test(existingEndsOn) &&
    existingStartsOn <= existingEndsOn;

  let startsOn: string;
  let endsOn: string;
  if (hasExplicitRange) {
    startsOn = existingStartsOn;
    endsOn = existingEndsOn;
  } else {
    const range = periodRange(period, kind);
    startsOn = range.startsOn;
    endsOn = range.endsOn;
  }

  // Resolve asOfDate: check asOfDate, then asOfInstant (set by PeriodRangeNavigator),
  // fallback to endsOn. An explicit cutoff may be earlier than the selected period end;
  // individual report queries clamp their end date to that cutoff.
  const rawAsOfInstant = search.get("asOfInstant");
  const asOfFromInstant = rawAsOfInstant ? rawAsOfInstant.slice(0, 10) : undefined;
  let asOfDate = search.get("asOfDate") ?? asOfFromInstant ?? endsOn;
  if (!ISO_DATE.test(asOfDate)) asOfDate = endsOn;
  const today = new Date().toISOString().slice(0, 10);
  // Never send a future asOf — clamp to today
  if (asOfDate > today) asOfDate = today;
  // But asOf must be >= startsOn for the query to be valid
  if (asOfDate < startsOn) asOfDate = startsOn;
  search.set("startsOn", startsOn);
  search.set("endsOn", endsOn);
  search.set("asOfDate", asOfDate);
  return search;
}

export function reportQuery(search: URLSearchParams) {
  const query = new URLSearchParams();
  const startsOn = search.get("startsOn") ?? "2025-01-01";
  const endsOn = effectiveEndsOn(search);
  query.set("startsOn", startsOn);
  query.set("endsOn", endsOn);
  query.set("asOfInstant", `${search.get("asOfDate") ?? endsOn}T16:59:59.999Z`);
  query.set("framework", "TT133");
  for (const key of ["serviceLineCode", "teamId", "ownerId", "projectId"]) {
    const value = search.get(key);
    if (value) query.set(key, value);
  }
  return query;
}

export function effectiveEndsOn(search: URLSearchParams) {
  const endsOn = search.get("endsOn") ?? "2025-12-31";
  const asOfDate = search.get("asOfDate") ?? endsOn;
  return endsOn > asOfDate ? asOfDate : endsOn;
}

function performanceQuery(search: URLSearchParams) {
  const query = new URLSearchParams();
  query.set("periodId", search.get("periodId") ?? "CAL-2025-01");
  query.set("periodBasis", "calendar");
  query.set("actualBasis", search.get("actualBasis") ?? "invoiced");
  const asOfDate = search.get("asOfDate") ?? search.get("endsOn") ?? "2025-12-31";
  query.set("asOfInstant", `${asOfDate}T16:59:59.999Z`);
  for (const key of ["serviceLineCode", "teamId", "ownerId"]) {
    const value = search.get(key);
    if (value) query.set(key, value);
  }
  return query;
}

export function actualSummaryQuery(search: URLSearchParams) {
  const query = new URLSearchParams({
    actualBasis: search.get("actualBasis") ?? "invoiced",
    from: search.get("startsOn") ?? "2025-01-01",
    to: effectiveEndsOn(search),
  });
  for (const key of ["serviceLineCode", "teamId", "ownerId"]) {
    const value = search.get(key);
    if (value) query.set(key, value);
  }
  return query;
}

export function projectQuery(search: URLSearchParams) {
  const query = new URLSearchParams();
  const startsOn = search.get("startsOn") ?? "2025-01-01";
  const endsOn = effectiveEndsOn(search);
  query.set("periodStart", startsOn);
  query.set("periodEnd", endsOn);
  query.set("asOf", search.get("asOfDate") ?? endsOn);
  if (search.get("serviceLineCode")) query.set("serviceLineId", search.get("serviceLineCode")!);
  return query;
}

function money(value: string | null | undefined, currency = "VND") {
  if (value == null) return "N/A";
  return `${new Intl.NumberFormat("vi-VN").format(BigInt(value))} ${currency === "VND" ? "₫" : currency}`;
}

function ratio(value: number | null | undefined) {
  return value == null
    ? "N/A"
    : `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value / 100)}%`;
}
function months(value: string | null | undefined) {
  if (value == null) return "N/A";
  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 3 }).format(Number(value) / 1000)} tháng`;
}

function sumMinor(values: readonly (string | null | undefined)[]) {
  return values.reduce<bigint>((total, value) => total + BigInt(value ?? "0"), 0n).toString();
}

function daysBetween(startsOn: string, endsOn: string) {
  const start = Date.parse(`${startsOn}T00:00:00Z`);
  const end = Date.parse(`${endsOn}T00:00:00Z`);
  return Number.isFinite(start) && Number.isFinite(end)
    ? Math.max(1, Math.round((end - start) / 86_400_000) + 1)
    : 30;
}

function formatStatusBadge(status?: string): string | null {
  if (!status) return null;
  const map: Record<string, string> = {
    missing_reviewed_burn: "Thiếu burn rate",
    out_of_balance: "Lệch đối soát",
    missing: "Thiếu dữ liệu",
    at_risk: "Cần lưu ý",
    on_track: "Đạt mục tiêu",
    "Cần rà soát": "Cần rà soát",
    "Chưa có dữ liệu": "Chưa có dữ liệu",
    "Dồn tích": "Dồn tích",
  };

  if (
    status === "available" ||
    status === "tied" ||
    status === "ok" ||
    status === "ready" ||
    status === "normal" ||
    status === "balanced"
  ) {
    return null;
  }

  if (/^\d+\s/.test(status)) {
    return status;
  }

  return map[status] ?? status;
}

function MetricCard({
  title,
  value,
  description,
  href,
  status,
  provisional = false,
  onQuick,
  trend,
}: {
  title: string;
  value: string;
  description: string;
  href: string;
  status?: string;
  provisional?: boolean;
  onQuick?: () => void;
  trend?: readonly number[];
}) {
  const formattedStatus = formatStatusBadge(status);
  const trendGradientId = `metric-trend-${useId().replace(/:/g, "")}`;

  const cardElement = (
    <Card className="group relative flex h-full min-w-0 cursor-pointer flex-col overflow-hidden rounded-3xl border-border/60 bg-card/75 shadow-sm backdrop-blur transition-all hover:-translate-y-1 hover:border-primary/50 hover:bg-accent/30 hover:shadow-lg active:scale-[0.99]">
      <CardHeader className="gap-2 pb-2">
        <CardTitle className="line-clamp-2 min-h-10 text-base leading-5 transition-colors group-hover:text-primary">
          {title}
        </CardTitle>
        <CardDescription className="line-clamp-2 min-h-10">{description}</CardDescription>
      </CardHeader>
      <CardContent className="mt-auto pb-4 pt-0">
        <p className="text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
        {trend && trend.length > 1 ? (
          <div className="mt-3 h-12 w-full" aria-label="Xu hướng chỉ số">
            <ChartContainer
              config={
                { trend: { label: "Xu hướng", color: "var(--chart-1)" } } satisfies ChartConfig
              }
              className="h-full w-full aspect-auto"
              initialDimension={{ width: 260, height: 48 }}
            >
              <AreaChart data={trend.map((point, index) => ({ index, value: point }))}>
                <defs>
                  <linearGradient id={trendGradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-trend)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--color-trend)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="var(--color-trend)"
                  fill={`url(#${trendGradientId})`}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ChartContainer>
          </div>
        ) : null}
      </CardContent>
      <CardFooter className="min-h-10 min-w-0 gap-1.5 overflow-hidden pb-4 pt-0">
        {provisional ? (
          <Badge variant="secondary" className="shrink-0 text-xs font-normal">
            Tạm tính
          </Badge>
        ) : null}
        {formattedStatus ? (
          <Badge
            variant="outline"
            className="min-w-0 max-w-full truncate text-xs font-normal"
            title={formattedStatus}
          >
            {formattedStatus}
          </Badge>
        ) : null}
        <span className="ml-auto flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-transform group-hover:translate-x-0.5">
          <ArrowRight className="size-4" />
        </span>
      </CardFooter>
    </Card>
  );

  if (onQuick) {
    return (
      <div
        onClick={onQuick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onQuick();
        }}
        className="h-full"
      >
        {cardElement}
      </div>
    );
  }

  return (
    <Link href={href} className="block h-full no-underline">
      {cardElement}
    </Link>
  );
}

type DimensionValue = Readonly<{ kind: string; code: string; name: string; is_active: boolean }>;

function DashboardFilters({
  open,
  onOpenChange,
  search,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  search: URLSearchParams;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { client, hydrated } = useAuthenticatedApiClient();
  const [serviceLines, setServiceLines] = useState<readonly DimensionValue[]>([]);
  const [selectedServiceLine, setSelectedServiceLine] = useState(
    search.get("serviceLineCode") ?? "",
  );

  useEffect(() => {
    if (!hydrated) return;
    client
      .data<{ items: DimensionValue[] }>("master-data/dimensions?limit=100")
      .then((res) => {
        const items = Array.isArray(res)
          ? res
          : ((res as { items?: DimensionValue[] }).items ?? []);
        setServiceLines(items.filter((d) => d.kind === "service_line" && d.is_active));
      })
      .catch(() => setServiceLines([]));
  }, [client, hydrated]);

  // Sync when search changes (e.g. external URL update)
  useEffect(() => {
    setSelectedServiceLine(search.get("serviceLineCode") ?? "");
  }, [search]);

  function apply(formData: FormData) {
    const q = new URLSearchParams();
    for (const key of ["periodId", "actualBasis", "startsOn", "endsOn", "asOfDate"]) {
      const value = String(formData.get(key) ?? "").trim();
      if (value) q.set(key, value);
    }
    if (selectedServiceLine) q.set("serviceLineCode", selectedServiceLine);
    router.replace(`${pathname}?${q}`);
    onOpenChange(false);
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline">
          <Filter data-icon="inline-start" />
          Bộ lọc
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="max-h-[min(70vh,36rem)] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto p-0"
      >
        <form action={apply} className="flex flex-col">
          <div className="border-b p-4">
            <h3 className="font-medium">Bộ lọc dashboard</h3>
            <p className="text-sm text-muted-foreground">Chọn khoảng thời gian và mảng dịch vụ.</p>
          </div>
          <FieldGroup className="p-4">
            <Field>
              <FieldLabel htmlFor="dash-start">Từ ngày</FieldLabel>
              <Input
                id="dash-start"
                type="date"
                name="startsOn"
                defaultValue={search.get("startsOn") ?? "2025-01-01"}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="dash-end">Đến ngày</FieldLabel>
              <Input
                id="dash-end"
                type="date"
                name="endsOn"
                defaultValue={search.get("endsOn") ?? "2025-12-31"}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="dash-service">Mảng dịch vụ</FieldLabel>
              <Select value={selectedServiceLine} onValueChange={setSelectedServiceLine}>
                <SelectTrigger id="dash-service" className="w-full">
                  <SelectValue placeholder="Tất cả mảng" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Tất cả mảng</SelectItem>
                  {serviceLines.map((sl) => (
                    <SelectItem key={sl.code} value={sl.code}>
                      {sl.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          <div className="flex justify-end border-t bg-muted/50 p-4">
            <Button type="submit">Áp dụng</Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function PreviewDialog({ preview, onClose }: { preview?: Preview; onClose(): void }) {
  return (
    <Dialog
      open={Boolean(preview)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{preview?.title ?? "Nguồn dashboard"}</DialogTitle>
          <DialogDescription>{preview?.description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {preview?.facts?.length ? (
            <dl className="grid gap-3">
              {preview.facts.map((fact) => (
                <div key={fact.label} className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">{fact.label}</dt>
                  <dd className="tabular-nums">{fact.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {preview?.sourceIds.length ? (
            <>
              <p className="text-sm font-medium">Source IDs</p>
              <div className="flex flex-wrap gap-2">
                {preview.sourceIds.map((id) => (
                  <Badge variant="outline" key={id} className="max-w-full break-all">
                    {id}
                  </Badge>
                ))}
              </div>
            </>
          ) : null}
          {preview ? (
            <Button asChild>
              <Link href={preview.href}>Mở trang drill-down đầy đủ</Link>
            </Button>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function useDashboardData() {
  const { client, hydrated, hasToken } = useAuthenticatedApiClient();
  const params = useSearchParams();
  const [data, setData] = useState<DashboardData>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const key = params.toString();
  const load = useCallback(async () => {
    if (!hydrated) return;
    setLoading(true);
    setError("");
    if (!hasToken) {
      setData({});
      setError("Kết nối API cần access token để tải dashboard điều hành.");
      setLoading(false);
      return;
    }
    const requestedSearch = new URLSearchParams(key);
    const discoverySearch = resolvedDashboardSearch(requestedSearch);
    let discoveredOperating: OperatingDashboardWire | undefined;
    if (!requestedSearch.has("periodId")) {
      const discoveryQuery = projectQuery(discoverySearch);
      const discoveryAsOf = discoverySearch.get("asOfDate")!;
      const discoveryOperatingQuery = new URLSearchParams({
        asOf: discoveryAsOf,
        startsOn: discoveryQuery.get("periodStart")!,
        endsOn: discoveryQuery.get("periodEnd")!,
        limit: "20",
      });
      try {
        discoveredOperating = await client.data<OperatingDashboardWire>(
          `reports/operating-dashboard?${discoveryOperatingQuery}`,
        );
      } catch {
        // The settled request below exposes the operating API failure to the UI.
      }
    }
    const search = resolvedDashboardSearch(requestedSearch, discoveredOperating?.sourceControls);
    const rq = reportQuery(search);
    const pq = performanceQuery(search);
    const aq = actualSummaryQuery(search);
    const jq = projectQuery(search);
    const asOf = search.get("asOfDate") ?? search.get("endsOn") ?? "2025-12-31";
    const oq = new URLSearchParams({
      asOf,
      startsOn: search.get("startsOn") ?? "2025-01-01",
      endsOn: effectiveEndsOn(search),
      limit: "20",
    });

    const [
      executive,
      performance,
      projects,
      aging,
      profitAndLoss,
      taxExpenses,
      vat,
      operating,
      actualSummary,
    ] = await Promise.allSettled([
      client.data<ExecutiveMetricsContract>(`reports/executive-metrics?${rq}`),
      client.data<PerformanceComparisonContract>(`reports/performance-comparisons?${pq}`),
      client.data<ProjectProfitabilityReport>(`reports/project-profitability?${jq}`),
      client.data<AgingReportContract>(
        `reports/ar-aging?asOf=${encodeURIComponent(asOf)}&limit=100`,
      ),
      client.data<ProfitAndLossContract>(`reports/financial-statements/profit-and-loss?${rq}`),
      client.data<TaxExpenseReviewContract>(`reports/tax/expense-exceptions?${rq}`),
      client.data<VatReconciliationContract>(`reports/tax/vat-reconciliation?${rq}`),
      client.data<OperatingDashboardWire>(`reports/operating-dashboard?${oq}`),
      client.data<ActualFactSummaryWire>(`planning-actual-facts/summary?${aq}`),
    ]);

    const next: DashboardData = {
      executive: executive.status === "fulfilled" ? executive.value : undefined,
      performance: performance.status === "fulfilled" ? performance.value : undefined,
      projects: projects.status === "fulfilled" ? projects.value : undefined,
      aging: aging.status === "fulfilled" ? aging.value : undefined,
      profitAndLoss: profitAndLoss.status === "fulfilled" ? profitAndLoss.value : undefined,
      taxExpenses: taxExpenses.status === "fulfilled" ? taxExpenses.value : undefined,
      vat: vat.status === "fulfilled" ? vat.value : undefined,
      operating: operating.status === "fulfilled" ? operating.value : undefined,
      actualSummary: actualSummary.status === "fulfilled" ? actualSummary.value : undefined,
      failures: {
        executive: executive.status === "rejected" ? String(executive.reason) : "",
        performance: performance.status === "rejected" ? String(performance.reason) : "",
        projects: projects.status === "rejected" ? String(projects.reason) : "",
        aging: aging.status === "rejected" ? String(aging.reason) : "",
        profitAndLoss: profitAndLoss.status === "rejected" ? String(profitAndLoss.reason) : "",
        taxExpenses: taxExpenses.status === "rejected" ? String(taxExpenses.reason) : "",
        vat: vat.status === "rejected" ? String(vat.reason) : "",
        operating: operating.status === "rejected" ? String(operating.reason) : "",
        actualSummary: actualSummary.status === "rejected" ? String(actualSummary.reason) : "",
      },
      searchKey: search.toString(),
    };
    setData(next);
    if (
      !next.executive &&
      !next.performance &&
      !next.projects &&
      !next.aging &&
      !next.profitAndLoss &&
      !next.taxExpenses &&
      !next.vat &&
      !next.operating &&
      !next.actualSummary
    ) {
      const details = Object.entries(next.failures ?? {})
        .filter(([, err]) => Boolean(err))
        .map(([name, err]) => `${name}: ${err}`)
        .join("; ");
      setError(
        `Không thể tải các báo cáo nguồn của dashboard.${details ? ` Details: ${details}` : ""}`,
      );
    }
    setLoading(false);
  }, [client, hasToken, hydrated, key]);
  useEffect(() => void load(), [load]);
  return {
    data,
    loading,
    error,
    reload: load,
    search: new URLSearchParams(data.searchKey ?? key),
  };
}

type ExpenseOverviewRow = Record<string, unknown> & {
  __sourceKind: "documents" | "expenses";
  __invoicePresence: "present" | "missing";
};

function useExpenseOverviewRows(search: URLSearchParams) {
  const { client, hydrated, hasToken } = useAuthenticatedApiClient();
  const [rows, setRows] = useState<readonly ExpenseOverviewRow[]>([]);
  const [error, setError] = useState("");
  const key = search.toString();
  useEffect(() => {
    if (!hydrated || !hasToken) return;
    const source = new URLSearchParams(key);
    const shared = new URLSearchParams({ limit: "500" });
    for (const name of ["startsOn", "endsOn", "state"] as const) {
      const value = source.get(name);
      if (value) shared.set(name, value);
    }
    const documents = new URLSearchParams(shared);
    documents.set("type", "purchase_invoice");
    let active = true;
    setError("");
    void Promise.all([
      client.data<{ items?: Record<string, unknown>[] } | Record<string, unknown>[]>(
        `commercial-documents?${documents}`,
      ),
      client.data<{ items?: Record<string, unknown>[] } | Record<string, unknown>[]>(
        `expenses?${shared}`,
      ),
    ])
      .then(([documentPayload, expensePayload]) => {
        if (!active) return;
        const startsOn = source.get("startsOn");
        const endsOn = source.get("endsOn");
        const inPeriod = (row: Record<string, unknown>) => {
          const date = String(
            row.documentDate ?? row.document_date ?? row.expenseDate ?? row.expense_date ?? "",
          );
          if (startsOn && date && date < startsOn) return false;
          if (endsOn && date && date > endsOn) return false;
          return true;
        };
        const documentRows = (
          Array.isArray(documentPayload) ? documentPayload : (documentPayload.items ?? [])
        ).filter(inPeriod);
        const expenseRows = (
          Array.isArray(expensePayload) ? expensePayload : (expensePayload.items ?? [])
        ).filter(inPeriod);
        setRows([
          ...documentRows.map((row) => ({
            ...row,
            __sourceKind: "documents" as const,
            __invoicePresence: "present" as const,
          })),
          ...expenseRows.map((row) => ({
            ...row,
            __sourceKind: "expenses" as const,
            __invoicePresence: "missing" as const,
          })),
        ]);
      })
      .catch((cause) => {
        if (!active) return;
        setRows([]);
        setError(
          cause instanceof Error ? cause.message : "Không thể tải overview chi phí canonical.",
        );
      });
    return () => {
      active = false;
    };
  }, [client, hasToken, hydrated, key]);
  return { rows, error };
}

export function ExecutiveDashboardWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const { data, loading, error, search } = useDashboardData();
  const expenseOverview = useExpenseOverviewRows(search);
  const [filters, setFilters] = useState(false);
  const [preview, setPreview] = useState<Preview>();
  const currentBasis = search.get("actualBasis") ?? "invoiced";
  const handleBasisChange = (val: string) => {
    const next = new URLSearchParams(search);
    next.set("actualBasis", val);
    router.replace(`${pathname}?${next.toString()}`);
  };
  const q = search.toString();
  const expenseHref = new URLSearchParams({ invoiceStatus: "all" });
  for (const name of ["startsOn", "endsOn", "state"] as const) {
    const value = search.get(name);
    if (value) expenseHref.set(name, value);
  }
  const executive = data.executive;
  const performance = data.performance;
  const operating = data.operating;
  const profitAndLoss = data.profitAndLoss;
  const taxExpenses = data.taxExpenses;
  const vat = data.vat;
  const usingOperatingFallback = !operating;
  const projects = data.projects?.items ?? [];
  const recognizedMinor = sumMinor(projects.map((item) => item.recognizedRevenueMinor));
  const fallbackOverdueMinor = sumMinor(
    (data.aging?.items ?? [])
      .filter((item) => (item.daysOverdue ?? 0) > 0)
      .map((item) => item.baseOutstandingMinor),
  );
  const periodDays = daysBetween(
    data.projects?.periodStart ?? executive?.period.startsOn ?? "2026-08-01",
    data.projects?.periodEnd ?? executive?.period.endsOn ?? "2026-08-31",
  );
  const fallbackDso =
    BigInt(recognizedMinor) > 0n
      ? `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(Number((BigInt(data.aging?.baseOutstandingTotalMinor ?? "0") * BigInt(periodDays * 10)) / BigInt(recognizedMinor)) / 10)} ngày`
      : "N/A";
  const overdueMinor = operating?.collections.overdueMinor ?? fallbackOverdueMinor;
  const overdueCount = (data.aging?.items ?? []).filter(
    (item) => (item.daysOverdue ?? 0) > 0,
  ).length;
  const dso = operating
    ? operating.collections.dsoDays == null
      ? "N/A"
      : `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(operating.collections.dsoDays)} ngày`
    : fallbackDso;
  const { companyOwesOwnerMinor, ownerHoldsCompanyFundsMinor } = ownerSettlementDashboardAmounts(
    operating?.financials,
  );
  const netCompanyFundsMinor =
    operating?.financials.netCompanyFundsMinor ??
    (
      BigInt(operating?.financials.cashAndBankMinor ?? "0") - BigInt(companyOwesOwnerMinor)
    ).toString();
  const showNetCompanyFunds = shouldShowNetCompanyFunds(companyOwesOwnerMinor);
  const taxableProfitMinor =
    profitAndLoss == null || taxExpenses == null
      ? undefined
      : (
          BigInt(profitAndLoss.profitBeforeTaxMinor) + BigInt(taxExpenses.citIneligibleMinor)
        ).toString();
  const corporateIncomeTaxMinor =
    taxableProfitMinor == null || operating?.financials.corporateIncomeTaxRateBps == null
      ? undefined
      : (
          ((BigInt(taxableProfitMinor) > 0n ? BigInt(taxableProfitMinor) : 0n) *
            BigInt(operating.financials.corporateIncomeTaxRateBps)) /
          10_000n
        ).toString();
  const projectPipelineRows = [...(operating?.backlog.projects ?? [])]
    .filter(
      (project) =>
        BigInt(project.contractedMinor ?? "0") !== 0n ||
        BigInt(project.invoicedMinor ?? "0") !== 0n ||
        BigInt(project.backlogMinor ?? "0") !== 0n,
    )
    .sort((left, right) => {
      const leftActivity = BigInt(left.invoicedMinor ?? "0") + BigInt(left.backlogMinor ?? "0");
      const rightActivity = BigInt(right.invoicedMinor ?? "0") + BigInt(right.backlogMinor ?? "0");
      return leftActivity === rightActivity ? 0 : leftActivity > rightActivity ? -1 : 1;
    })
    .slice(0, 6);
  const flaggedPerformance =
    performance?.confidenceFlags.filter(
      (f) => (f.severity as string) === "critical" || !f.code.startsWith("missing_"),
    ).length ?? 0;
  const flagged =
    flaggedPerformance +
    (data.projects?.items.filter((item) => item.confidenceCodes.length).length ?? 0) +
    (data.aging?.exceptions.length ?? 0);
  const pendingImportRows = operating?.dataQuality.pendingCount ?? 0;
  const activeProjects = operating?.backlog.projects ?? [];
  const clientRows = operating?.clientConcentration.clients ?? [];
  const portfolioProgress = (() => {
    const contracted = BigInt(operating?.backlog.contractedMinor ?? "0");
    const invoiced = BigInt(operating?.backlog.invoicedMinor ?? "0");
    if (contracted <= 0n) return 0;
    return Math.min(100, Number((invoiced * 10_000n) / contracted) / 100);
  })();
  const projectHighlights = [...activeProjects]
    .sort((left, right) => {
      const leftValue = BigInt(left.contractedMinor ?? "0");
      const rightValue = BigInt(right.contractedMinor ?? "0");
      return leftValue === rightValue ? 0 : leftValue > rightValue ? -1 : 1;
    })
    .slice(0, 3);
  const sourceMonthly = operating?.sourceControls?.monthly ?? [];
  const startsOnMonth = (search.get("startsOn") ?? "2025-01-01").slice(0, 7);
  const endsOnMonth = (search.get("endsOn") ?? "2025-12-31").slice(0, 7);
  type MonthlyRow = {
    period: string;
    kind?: string;
    revenueMinor?: string;
    expenseMinor?: string;
    [key: string]: unknown;
  };
  let filteredMonthly: readonly MonthlyRow[] = (sourceMonthly as readonly MonthlyRow[]).filter(
    (row) => row.period >= startsOnMonth && row.period <= endsOnMonth,
  );
  if (filteredMonthly.length === 0 && operating?.financials?.monthly) {
    filteredMonthly = (operating.financials.monthly as readonly MonthlyRow[]).filter(
      (row) => row.period >= startsOnMonth && row.period <= endsOnMonth,
    );
  }
  const profitabilityMonthly = filteredMonthly.filter(
    (row) => row.kind === "profitability_control",
  );
  const baseMonthly = profitabilityMonthly.length ? profitabilityMonthly : filteredMonthly;

  const chartPoints: readonly Readonly<{ label: string; valueMinor: string }>[] = baseMonthly.map(
    (row) => ({
      label: String(row.period ?? ""),
      valueMinor: String(row.revenueMinor ?? "0"),
    }),
  );
  const comparisonPoints: readonly Readonly<{ label: string; valueMinor: string }>[] = [
    { label: "Kỳ trước", valueMinor: performance?.monthOverMonth.denominatorMinor ?? "0" },
    { label: "Thực tế kỳ này", valueMinor: performance?.actualVsFullTarget.numeratorMinor ?? "0" },
    {
      label: "Dự báo giữ lại",
      valueMinor: performance?.actualVsRetainedForecast.denominatorMinor ?? "0",
    },
  ].filter((point): point is { label: string; valueMinor: string } => point.valueMinor != null);
  const displayedChartPoints: readonly Readonly<{ label: string; valueMinor: string }>[] =
    chartPoints.length ? chartPoints : comparisonPoints;

  return (
    <ModulePage
      title="Tổng quan điều hành"
      description="Tổng quan chỉ số doanh thu, công nợ, hiệu suất và sức khỏe tài chính doanh nghiệp."
      section="Điều hành"
    >
      <div className="relative isolate overflow-hidden rounded-[2rem] bg-muted/30 p-4 md:p-6">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-24 -top-24 -z-10 size-72 rounded-full bg-primary/20 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-20 top-1/3 -z-10 size-80 rounded-full bg-accent/30 blur-3xl"
        />
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <PeriodRangeNavigator />
              <Select value={currentBasis} onValueChange={handleBasisChange}>
                <SelectTrigger className="w-[195px] h-9">
                  <SelectValue placeholder="Cơ sở doanh thu" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="invoiced">Giá trị đã xuất hóa đơn</SelectItem>
                  <SelectItem value="recognized">Doanh thu đã ghi nhận</SelectItem>
                  <SelectItem value="collected">Đã thu từ khách hàng</SelectItem>
                </SelectContent>
              </Select>
              {search.get("serviceLineCode") ? (
                <Badge variant="outline">Mảng: {search.get("serviceLineCode")}</Badge>
              ) : null}
            </div>
            <div className="flex gap-2">
              <DashboardFilters open={filters} onOpenChange={setFilters} search={search} />
              <Button asChild>
                <Link href={`/dashboard/finance-review?${q}`}>
                  <ListChecks data-icon="inline-start" />
                  Finance review
                </Link>
              </Button>
            </div>
          </div>
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Dashboard chưa sẵn sàng</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {!loading && flagged > 0 ? (
            <Alert>
              <AlertTitle>{flagged} tín hiệu cần rà soát</AlertTitle>
              <AlertDescription>
                Mở Finance review để xem đúng các ngoại lệ kế toán và báo cáo đang được tính ở đây.
              </AlertDescription>
            </Alert>
          ) : null}
          {!loading && pendingImportRows > 0 ? (
            <Alert>
              <AlertTitle>{pendingImportRows} dòng dữ liệu nguồn đang chờ chuẩn hóa</AlertTitle>
              <AlertDescription>
                Đây là backlog import riêng, không được cộng vào số tín hiệu ngoại lệ kế toán phía
                trên.
              </AlertDescription>
            </Alert>
          ) : null}
          {loading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-48 w-full" />
              ))}
            </div>
          ) : !executive && !performance && !data.projects && !data.aging && !operating ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Chưa có dữ liệu dashboard</EmptyTitle>
                <EmptyDescription>Kiểm tra kết nối API hoặc chọn kỳ có dữ liệu.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <section aria-labelledby="operating-pulse-title" className="space-y-4">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <h2 id="operating-pulse-title" className="text-lg font-semibold">
                      Nhịp vận hành
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Công việc, khách hàng và dữ liệu cần chú ý trong cùng kỳ báo cáo.
                    </p>
                  </div>
                  <Badge variant={flagged + pendingImportRows > 0 ? "secondary" : "outline"}>
                    {flagged + pendingImportRows > 0
                      ? `${flagged + pendingImportRows} việc cần xem`
                      : "Vận hành ổn định"}
                  </Badge>
                </div>

                <div className="grid gap-4 lg:grid-cols-12">
                  <Card className="overflow-hidden bg-primary text-primary-foreground lg:col-span-5">
                    <CardHeader>
                      <div className="flex items-center justify-between gap-3">
                        <Badge variant="secondary">Danh mục dự án</Badge>
                        <BriefcaseBusiness aria-hidden="true" className="size-5 opacity-80" />
                      </div>
                      <CardTitle className="text-3xl tabular-nums">
                        {activeProjects.length} dự án
                      </CardTitle>
                      <CardDescription className="text-primary-foreground/75">
                        {money(operating?.backlog.remainingMinor, operating?.currency)} giá trị hợp
                        đồng còn lại.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span>Tiến độ xuất hóa đơn</span>
                        <span className="font-medium tabular-nums">
                          {new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(
                            portfolioProgress,
                          )}
                          %
                        </span>
                      </div>
                      <div
                        className="h-2 overflow-hidden rounded-full bg-primary-foreground/20"
                        role="progressbar"
                        aria-label="Tiến độ xuất hóa đơn của danh mục dự án"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={portfolioProgress}
                      >
                        <div
                          className="h-full rounded-full bg-primary-foreground transition-[width]"
                          style={{ width: `${portfolioProgress}%` }}
                        />
                      </div>
                      <div className="flex justify-between gap-4 text-xs text-primary-foreground/75">
                        <span>
                          Đã xuất {money(operating?.backlog.invoicedMinor, operating?.currency)}
                        </span>
                        <span>
                          Hợp đồng {money(operating?.backlog.contractedMinor, operating?.currency)}
                        </span>
                      </div>
                    </CardContent>
                    <CardFooter>
                      <Button asChild variant="secondary" size="sm">
                        <Link href="/projects">
                          Xem danh mục <ArrowRight data-icon="inline-end" />
                        </Link>
                      </Button>
                    </CardFooter>
                  </Card>

                  <Card className="lg:col-span-4">
                    <CardHeader>
                      <div className="flex items-center justify-between gap-3">
                        <CardTitle className="text-base">Khách hàng trọng tâm</CardTitle>
                        <Users aria-hidden="true" className="size-5 text-primary" />
                      </div>
                      <CardDescription>
                        Tỷ trọng doanh thu giúp nhận diện mức độ tập trung khách hàng.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-end justify-between gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground">Khách hàng lớn nhất</p>
                          <p className="text-2xl font-semibold tabular-nums">
                            {operating?.clientConcentration.topClientShareBps == null
                              ? "N/A"
                              : ratio(operating.clientConcentration.topClientShareBps)}
                          </p>
                        </div>
                        <Badge variant="outline">{clientRows.length} khách hàng</Badge>
                      </div>
                      <div className="space-y-3">
                        {clientRows.slice(0, 3).map((client, index) => (
                          <div
                            key={client.clientId ?? `${client.clientName}-${index}`}
                            className="space-y-1"
                          >
                            <div className="flex items-center justify-between gap-3 text-sm">
                              <span className="truncate font-medium">
                                {client.clientName ?? "Khách hàng chưa đặt tên"}
                              </span>
                              <span className="shrink-0 tabular-nums text-muted-foreground">
                                {money(client.revenueMinor, operating?.currency)}
                              </span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-primary"
                                style={{
                                  width: `${Math.min(
                                    100,
                                    operating &&
                                      BigInt(operating.clientConcentration.totalRevenueMinor) > 0n
                                      ? Number(
                                          (BigInt(client.revenueMinor ?? "0") * 10_000n) /
                                            BigInt(operating.clientConcentration.totalRevenueMinor),
                                        ) / 100
                                      : 0,
                                  )}%`,
                                }}
                              />
                            </div>
                          </div>
                        ))}
                        {!clientRows.length ? (
                          <p className="text-sm text-muted-foreground">
                            Chưa có doanh thu theo khách hàng.
                          </p>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-accent/40 lg:col-span-3">
                    <CardHeader>
                      <div className="flex items-center justify-between gap-3">
                        <CardTitle className="text-base">Hàng đợi rà soát</CardTitle>
                        <CircleAlert aria-hidden="true" className="size-5 text-accent-foreground" />
                      </div>
                      <CardDescription>
                        Những việc cần xử lý để số liệu đáng tin cậy hơn.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Link
                        href={`/dashboard/finance-review?${q}`}
                        className="flex items-center justify-between gap-3 rounded-lg bg-card p-3 text-sm shadow-sm transition-colors hover:bg-muted"
                      >
                        <span>Ngoại lệ báo cáo</span>
                        <Badge variant={flagged ? "secondary" : "outline"}>{flagged}</Badge>
                      </Link>
                      <Link
                        href="/settings/background-activities"
                        className="flex items-center justify-between gap-3 rounded-lg bg-card p-3 text-sm shadow-sm transition-colors hover:bg-muted"
                      >
                        <span>Dữ liệu chờ chuẩn hóa</span>
                        <Badge variant={pendingImportRows ? "secondary" : "outline"}>
                          {pendingImportRows}
                        </Badge>
                      </Link>
                      <div className="flex items-center justify-between gap-3 rounded-lg bg-card p-3 text-sm shadow-sm">
                        <span>Khoản phải thu quá hạn</span>
                        <Badge variant={overdueCount ? "destructive" : "outline"}>
                          {overdueCount}
                        </Badge>
                      </div>
                    </CardContent>
                    <CardFooter>
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/dashboard/finance-review?${q}`}>Mở hàng đợi</Link>
                      </Button>
                    </CardFooter>
                  </Card>
                </div>

                {projectHighlights.length ? (
                  <div className="grid gap-4 md:grid-cols-3">
                    {projectHighlights.map((project, index) => {
                      const contracted = BigInt(project.contractedMinor ?? "0");
                      const invoiced = BigInt(project.invoicedMinor ?? "0");
                      const progress =
                        contracted > 0n
                          ? Math.min(100, Number((invoiced * 10_000n) / contracted) / 100)
                          : 0;
                      return (
                        <Card
                          key={project.projectId ?? `${project.code}-${index}`}
                          className={cn(
                            "rounded-3xl border-border/60 shadow-sm transition-transform hover:-translate-y-1 hover:shadow-lg",
                            index === 0 && "bg-foreground text-background",
                            index === 1 && "bg-primary text-primary-foreground",
                            index > 1 && "bg-card/75 backdrop-blur",
                          )}
                        >
                          <CardHeader className="pb-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <CardTitle className="truncate text-base">
                                  {project.name ?? project.code ?? "Dự án chưa đặt tên"}
                                </CardTitle>
                                <CardDescription
                                  className={cn("truncate", index < 2 && "text-current/70")}
                                >
                                  {project.clientName ?? "Chưa gán khách hàng"}
                                </CardDescription>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <div className="flex items-center justify-between text-sm">
                              <span
                                className={index < 2 ? "text-current/70" : "text-muted-foreground"}
                              >
                                Đã xuất hóa đơn
                              </span>
                              <span className="font-medium tabular-nums">
                                {new Intl.NumberFormat("vi-VN", {
                                  maximumFractionDigits: 1,
                                }).format(progress)}
                                %
                              </span>
                            </div>
                            <div
                              className={cn(
                                "h-2 overflow-hidden rounded-full",
                                index < 2 ? "bg-current/20" : "bg-muted",
                              )}
                            >
                              <div
                                className={cn(
                                  "h-full rounded-full transition-[width]",
                                  index === 0
                                    ? "bg-background"
                                    : index === 1
                                      ? "bg-primary-foreground"
                                      : "bg-primary",
                                )}
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            <div
                              className={cn(
                                "flex items-center justify-between gap-3 text-xs",
                                index < 2 ? "text-current/70" : "text-muted-foreground",
                              )}
                            >
                              <span>{money(project.invoicedMinor, operating?.currency)}</span>
                              <span>Còn {money(project.backlogMinor, operating?.currency)}</span>
                            </div>
                          </CardContent>
                          <CardFooter className="flex items-center justify-between gap-3">
                            <StatusBadge status={project.state ?? "active"} />
                            {project.projectId ? (
                              <Button
                                asChild
                                variant={index < 2 ? "secondary" : "outline"}
                                size="icon-sm"
                                className="rounded-full"
                              >
                                <Link
                                  href={`/projects/${encodeURIComponent(project.projectId)}`}
                                  aria-label={`Mở dự án ${project.name ?? project.code ?? ""}`}
                                >
                                  <ArrowRight />
                                </Link>
                              </Button>
                            ) : null}
                          </CardFooter>
                        </Card>
                      );
                    })}
                  </div>
                ) : null}
              </section>

              <div className="flex items-center gap-2">
                <Activity aria-hidden="true" className="size-5 text-primary" />
                <div>
                  <h2 className="text-lg font-semibold">Sức khỏe tài chính</h2>
                  <p className="text-sm text-muted-foreground">
                    Thuế, công nợ và dòng tiền lấy từ các báo cáo kế toán chuẩn.
                  </p>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <MetricCard
                  title="Lợi nhuận tính thuế TNDN tạm tính"
                  value={money(taxableProfitMinor, profitAndLoss?.currency)}
                  description={`Lợi nhuận kế toán ${money(profitAndLoss?.profitBeforeTaxMinor, profitAndLoss?.currency)} + chi phí CIT không được trừ ${money(taxExpenses?.citIneligibleMinor, taxExpenses?.currency)}. Chi phí CIT chưa review: ${money(taxExpenses?.citUnreviewedMinor, taxExpenses?.currency)}.`}
                  href="/reports/tax/expense-exceptions"
                  status={taxExpenses?.status}
                  provisional={taxExpenses?.status !== "ready"}
                  trend={operating?.financials.monthly?.map(
                    (row) =>
                      Number(BigInt(row.revenueMinor ?? "0")) -
                      Number(BigInt(row.expenseMinor ?? "0")),
                  )}
                />
                <MetricCard
                  title="Thuế TNDN tạm tính"
                  value={money(corporateIncomeTaxMinor, profitAndLoss?.currency)}
                  description={`Lợi nhuận tính thuế tạm tính ${money(taxableProfitMinor, profitAndLoss?.currency)} × thuế suất đã duyệt ${
                    operating?.financials.corporateIncomeTaxRateBps == null
                      ? "N/A"
                      : `${operating.financials.corporateIncomeTaxRateBps / 100}%`
                  }`}
                  href="/reports/tax/expense-exceptions"
                  status={
                    operating?.financials.corporateIncomeTaxRateBps == null
                      ? "Thiếu chính sách thuế TNDN"
                      : taxExpenses?.status
                  }
                  provisional={taxExpenses?.status !== "ready"}
                />
                <MetricCard
                  title="VAT phải nộp"
                  value={money(vat?.netVatPayableMinor, vat?.currency)}
                  description={`VAT đầu ra ${money(vat?.outputVatMinor, vat?.currency)} − VAT đầu vào đủ điều kiện ${money(vat?.eligibleInputVatMinor, vat?.currency)}. VAT đầu vào chưa review: ${money(vat?.unreviewedInputVatMinor, vat?.currency)}.`}
                  href={`/reports/tax/vat-reconciliation/current?${q}`}
                  status={vat?.status}
                  provisional={vat?.status !== "ready"}
                />
                <MetricCard
                  title="VAT đầu vào chờ review"
                  value={money(vat?.unreviewedInputVatMinor, vat?.currency)}
                  description="Khoản VAT đầu vào chưa được khấu trừ; hoàn tất kiểm tra hóa đơn và hồ sơ để xác định số VAT được giảm"
                  href={`/reports/tax/vat-reconciliation/current?${q}`}
                  status={
                    vat?.unreviewedItemIds.length
                      ? `${vat.unreviewedItemIds.length} khoản`
                      : "Đã review hết"
                  }
                  provisional={Boolean(vat?.unreviewedItemIds.length)}
                />
                <MetricCard
                  title="Chi phí CIT chờ review"
                  value={money(taxExpenses?.citUnreviewedMinor, taxExpenses?.currency)}
                  description="Chi phí chưa xác định được trừ khi tính thuế TNDN; cần bổ sung hóa đơn, chứng từ hoặc kết luận kế toán"
                  href="/reports/tax/expense-exceptions"
                  status={
                    taxExpenses?.unreviewedItemIds.length
                      ? `${taxExpenses.unreviewedItemIds.length} khoản`
                      : "Đã review hết"
                  }
                  provisional={Boolean(taxExpenses?.unreviewedItemIds.length)}
                />
                <MetricCard
                  title="Công nợ cần thu"
                  value={money(data.aging?.baseOutstandingTotalMinor, data.aging?.baseCurrency)}
                  description={`Đã quá hạn ${money(overdueMinor, data.aging?.baseCurrency)} · DSO: ${dso}`}
                  href={`/receivables?asOf=${search.get("asOfDate") ?? "2026-08-31"}`}
                  status={overdueCount ? `${overdueCount} khoản quá hạn` : data.aging?.tieStatus}
                  provisional={usingOperatingFallback}
                />
                <MetricCard
                  title="Tiền công ty hiện có"
                  value={money(operating?.financials.cashAndBankMinor, operating?.currency)}
                  description={`Tổng tiền thuộc tài khoản và quỹ công ty: Ngân hàng ${money(operating?.financials.bankAvailableMinor, operating?.currency)}, tiền mặt ${money(operating?.financials.cashOnHandMinor, operating?.currency)}.`}
                  href={`/reports/financial-statements/balance-sheet/${search.get("asOfDate") ?? effectiveEndsOn(search)}?${q}`}
                  status="Tiền của công ty"
                  trend={operating?.financials.monthly?.map((row) =>
                    Number(BigInt(row.revenueMinor ?? "0")),
                  )}
                />
                <MetricCard
                  title="Công ty đang nợ chủ doanh nghiệp"
                  value={money(companyOwesOwnerMinor, operating?.currency ?? executive?.currency)}
                  description="Số quyết toán dòng tiền đã xác nhận mà công ty còn phải trả chủ. Không hiển thị số âm như một khoản nợ."
                  href="/banking/owner-current"
                  status="Nguồn: quyết toán đã xác nhận"
                />
                <MetricCard
                  title="Tiền công ty chủ đang giữ"
                  value={money(
                    ownerHoldsCompanyFundsMinor,
                    operating?.currency ?? executive?.currency,
                  )}
                  description="Phần tiền công ty đã giao hoặc rút cho chủ giữ vượt quá các khoản công ty còn nợ chủ. Đây là tài sản/tiền công ty, không phải nợ âm."
                  href="/banking/owner-current"
                  status="Chủ đang giữ tiền công ty"
                />
                {showNetCompanyFunds ? (
                  <MetricCard
                    title="Tiền ròng thực còn"
                    value={money(netCompanyFundsMinor, operating?.currency ?? executive?.currency)}
                    description={`Tiền công ty ${money(operating?.financials.cashAndBankMinor, operating?.currency)} − số công ty đang nợ chủ ${money(companyOwesOwnerMinor, operating?.currency ?? executive?.currency)}.`}
                    href={`/reports/financial-statements/balance-sheet/${search.get("asOfDate") ?? effectiveEndsOn(search)}?${q}`}
                    status="Sau nghĩa vụ với chủ"
                  />
                ) : null}
              </div>
              <Card>
                <CardHeader>
                  <CardTitle>Dự án đang tạo doanh thu</CardTitle>
                  <CardDescription>
                    So sánh hợp đồng, hóa đơn đã xuất và phần còn lại theo từng dự án.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {projectPipelineRows.length ? (
                    <div className="grid gap-5 md:grid-cols-2">
                      {projectPipelineRows.slice(0, 6).map((project) => {
                        const projectId = project.projectId ?? "";
                        const contracted = BigInt(project.contractedMinor ?? "0");
                        const invoiced = BigInt(project.invoicedMinor ?? "0");
                        const progress =
                          contracted > 0n
                            ? Math.min(100, Number((invoiced * 10000n) / contracted) / 100)
                            : 0;
                        return (
                          <Link
                            key={projectId}
                            href={`/projects/${encodeURIComponent(projectId)}`}
                            className="group space-y-2 rounded-lg bg-muted/40 p-4 transition-colors hover:bg-muted"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="truncate font-medium group-hover:text-primary">
                                {project.name ?? project.code ?? "Dự án chưa đặt tên"}
                              </span>
                              <span className="text-xs tabular-nums text-muted-foreground">
                                {progress.toFixed(0)}%
                              </span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-background">
                              <div
                                className="h-full rounded-full bg-primary transition-[width]"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            <div className="flex justify-between gap-3 text-xs text-muted-foreground">
                              <span>
                                Đã xuất {money(project.invoicedMinor, operating?.currency)}
                              </span>
                              <span>Còn {money(project.backlogMinor, operating?.currency)}</span>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  ) : (
                    <Empty>
                      <EmptyHeader>
                        <EmptyTitle>Chưa có dự án có giá trị thương mại</EmptyTitle>
                        <EmptyDescription>
                          Bổ sung hợp đồng hoặc phân bổ hóa đơn vào dự án để theo dõi tại đây.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  )}
                </CardContent>
              </Card>
            </>
          )}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <Link
                  href="/documents?invoiceStatus=present"
                  className="group/link flex items-center gap-1.5 transition-colors"
                >
                  <CardTitle className="text-base font-semibold transition-colors group-hover/link:text-primary">
                    Xu hướng doanh thu
                  </CardTitle>
                  <ArrowRight className="h-4 w-4 text-muted-foreground opacity-50 transition-all group-hover/link:translate-x-0.5 group-hover/link:text-primary group-hover/link:opacity-100" />
                </Link>
              </div>
              <CardDescription className="text-xs">
                So sánh doanh thu thực tế, kế hoạch mục tiêu và số liệu dự báo theo kỳ.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {displayedChartPoints.length ? (
                <ExecutiveTrendChart
                  points={displayedChartPoints}
                  currency={operating?.currency ?? performance?.currency ?? "VND"}
                />
              ) : (
                <p className="text-sm text-muted-foreground">Chưa có dữ liệu xu hướng.</p>
              )}
            </CardContent>
          </Card>
          {expenseOverview.error ? (
            <Alert variant="destructive">
              <AlertTitle>Không thể tải thống kê chi phí</AlertTitle>
              <AlertDescription>{expenseOverview.error}</AlertDescription>
            </Alert>
          ) : null}
          <ExpenseOverviewChart
            rows={expenseOverview.rows}
            currency={operating?.currency ?? data.projects?.currency ?? "VND"}
            href={`/expenses?${expenseHref}`}
          />
        </div>
      </div>
      <PreviewDialog preview={preview} onClose={() => setPreview(undefined)} />
    </ModulePage>
  );
}

export function FinanceReviewWorkspace() {
  const { data, loading, error, search } = useDashboardData();
  const q = search.toString();
  const rows = [
    ...(data.projects?.items.flatMap((project) =>
      project.confidenceFlags.map((flag) => ({
        id: `project:${project.projectId}:${flag.code}`,
        severity: flag.severity,
        module: "Lợi nhuận dự án",
        issue: flag.code,
        source: flag.sourceIds.join(", "),
        href: `/projects/${encodeURIComponent(project.projectId)}`,
      })),
    ) ?? []),
    ...(data.aging?.exceptions.map((item, index) => ({
      id: `aging:${index}`,
      severity: "warning",
      module: "Công nợ",
      issue: item.message,
      source: item.itemId ?? item.controlAccountCode ?? "AR aging",
      href: `/receivables?asOf=${data.aging?.asOf}`,
    })) ?? []),
    ...(data.performance?.confidenceFlags
      .filter((f) => (f.severity as string) === "critical" || !f.code.startsWith("missing_"))
      .map((flag) => ({
        id: `performance:${flag.code}`,
        severity: flag.severity,
        module: "Hiệu suất kế hoạch",
        issue: flag.reason,
        source: flag.sourceIds.join(", "),
        href: `/reports/performance/${encodeURIComponent(data.performance!.period.id)}?${q}`,
      })) ?? []),
  ];
  return (
    <ModulePage
      title="Finance review"
      description="Hàng đợi ngoại lệ từ các report API; mỗi dòng chuyển về đúng module sở hữu."
      section="Điều hành"
    >
      <div className="flex flex-col gap-6">
        <Button variant="ghost" asChild className="w-fit">
          <Link href={`/dashboard?${q}`}>Quay lại dashboard</Link>
        </Button>
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Không tải được review queue</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>Ngoại lệ cần xử lý</CardTitle>
            <CardDescription>
              Không trộn công thức hay sửa trạng thái tại dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {rows.map((row) => (
                  <Link
                    key={row.id}
                    href={row.href}
                    className="group rounded-lg bg-muted/40 p-4 transition-colors hover:bg-muted"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium group-hover:text-primary">{row.module}</span>
                      <Badge variant={row.severity === "critical" ? "destructive" : "outline"}>
                        {row.severity}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm">{row.issue}</p>
                    <p className="mt-2 truncate font-mono text-xs text-muted-foreground">
                      {row.source || "—"}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ModulePage>
  );
}

export function DashboardMetricDrilldownWorkspace({ metricKey }: { metricKey: string }) {
  const router = useRouter();
  const { data, loading, error, search } = useDashboardData();
  const q = search.toString();
  const executive = data.executive;
  const performance = data.performance;
  const overdueMinor = data.operating?.collections.overdueMinor ?? "0";
  const topClientShare = data.operating?.clientConcentration.topClientShareBps
    ? ratio(data.operating.clientConcentration.topClientShareBps)
    : "—";
  const details: Record<
    string,
    {
      title: string;
      value: string;
      formula: string;
      sourceIds: readonly string[];
      canonicalHref: string;
    }
  > = {
    revenue: {
      title: "Doanh thu thực tế",
      value: money(performance?.actualVsFullTarget.numeratorMinor, performance?.currency),
      formula: performance?.actualVsFullTarget.formulaVersion ?? "Performance Comparison API",
      sourceIds: performance?.actualVsFullTarget.numeratorSourceIds ?? [],
      canonicalHref: `/reports/performance/${encodeURIComponent(performance?.period.id ?? search.get("periodId") ?? "current")}?${q}`,
    },
    ros: {
      title: "ROS (Return on Sales)",
      value: ratio(executive?.ros.valueBps),
      formula: executive?.ros.formulaVersion ?? "Executive Metrics API",
      sourceIds: executive?.sourceBoundary.sourceIds ?? [],
      canonicalHref: `/reports/financial-statements/profit-and-loss/current?${q}`,
    },
    runway: {
      title: "Cash Runway",
      value: months(executive?.runwayMonthsThousandths),
      formula: executive?.runwayFormulaVersion ?? "Executive Metrics API",
      sourceIds: executive?.sourceBoundary.sourceIds ?? [],
      canonicalHref: `/reports/financial-statements/cash-flow/current?${q}`,
    },
    "equity-consumed": {
      title: "Equity consumed",
      value: ratio(executive?.equityConsumed.valueBps),
      formula: executive?.equityConsumed.formulaVersion ?? "Executive Metrics API",
      sourceIds: executive?.sourceBoundary.sourceIds ?? [],
      canonicalHref: `/reports/executive-metrics/equity?${q}`,
    },
    overdue: {
      title: "Công nợ quá hạn & DSO",
      value: money(overdueMinor, data.aging?.baseCurrency),
      formula: "AR Aging Read Model",
      sourceIds:
        data.aging?.exceptions.map((item) => item.itemId ?? item.controlAccountCode ?? "AR") ?? [],
      canonicalHref: `/receivables?asOf=${search.get("asOfDate") ?? "2026-08-31"}`,
    },
    client: {
      title: "Tập trung khách hàng",
      value: topClientShare,
      formula: "Operating & Executive Concentration Model",
      sourceIds: [],
      canonicalHref: "/customers",
    },
  };
  const detail = details[metricKey];
  useEffect(() => {
    if (detail?.canonicalHref) {
      router.replace(detail.canonicalHref);
    }
  }, [detail?.canonicalHref, router]);
  return (
    <ModulePage
      title={detail?.title ?? "Dashboard drill-down"}
      description="Số liệu chi tiết và nguồn chứng từ đối soát dồn tích."
      section="Điều hành"
    >
      <div className="flex max-w-4xl flex-col gap-6">
        <Button variant="ghost" asChild className="w-fit">
          <Link href={`/dashboard?${q}`}>Quay lại dashboard</Link>
        </Button>
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : error || !detail ? (
          <Alert variant="destructive">
            <AlertTitle>Không tải được metric</AlertTitle>
            <AlertDescription>{error || `Metric ${metricKey} không tồn tại.`}</AlertDescription>
          </Alert>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>{detail.title}</CardTitle>
                <CardDescription>{detail.formula}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold tabular-nums">{detail.value}</p>
                {executive?.sourceBoundary.ledgerCutoffFingerprint ? (
                  <p className="mt-3 break-all font-mono text-xs text-muted-foreground">
                    Fingerprint: {executive.sourceBoundary.ledgerCutoffFingerprint}
                  </p>
                ) : null}
              </CardContent>
              <CardFooter>
                <Button asChild>
                  <Link href={detail.canonicalHref}>
                    Mở báo cáo nguồn <ArrowRight data-icon="inline-end" />
                  </Link>
                </Button>
              </CardFooter>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Nguồn ổn định</CardTitle>
                <CardDescription>
                  Các ID được backend trả về; liên kết typed sẽ xuất hiện khi source resolver route
                  được công bố.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {detail.sourceIds.length ? (
                  detail.sourceIds.map((id) => (
                    <Badge key={id} variant="outline" className="max-w-full break-all">
                      {id}
                    </Badge>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Không có source ID.</p>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </ModulePage>
  );
}
