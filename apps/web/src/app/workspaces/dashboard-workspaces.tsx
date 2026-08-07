"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type {
  AgingReportContract,
  ExecutiveMetricsContract,
  PerformanceComparisonContract,
} from "@naai-erp/contracts";
import { ArrowRight, Filter, Info, ListChecks } from "lucide-react";
import type {
  ProjectProfitabilityReport,
  ProjectProfitabilitySummary,
} from "@/lib/api/project-profitability";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuthenticatedApiClient } from "@/lib/api";

const ExecutiveTrendChart = dynamic(() => import("@/components/dashboard/executive-trend-chart"), {
  loading: () => <Skeleton className="h-48 w-full" />,
  ssr: false,
});

const MonthlyCategoryStackedChart = dynamic(
  () =>
    import("@/components/dashboard/monthly-category-stacked-chart").then(
      (mod) => mod.MonthlyCategoryStackedChart,
    ),
  {
    loading: () => <Skeleton className="h-48 w-full" />,
    ssr: false,
  },
);

type DashboardData = Readonly<{
  executive?: ExecutiveMetricsContract;
  performance?: PerformanceComparisonContract;
  projects?: ProjectProfitabilityReport;
  aging?: AgingReportContract;
  operating?: OperatingDashboardWire;
  actualSummary?: ActualFactSummaryWire;
  failures?: Readonly<
    Record<
      "executive" | "performance" | "projects" | "aging" | "operating" | "actualSummary",
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
function isOperatingProject(
  project: OperatingProjectWire | ProjectProfitabilitySummary,
): project is OperatingProjectWire {
  return "estimateAtCompletionMinor" in project;
}
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

function resolvedDashboardSearch(
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
  // fallback to endsOn. Ensure asOf >= endsOn so the backend doesn't reject the request.
  const rawAsOfInstant = search.get("asOfInstant");
  const asOfFromInstant = rawAsOfInstant ? rawAsOfInstant.slice(0, 10) : undefined;
  let asOfDate = search.get("asOfDate") ?? asOfFromInstant ?? endsOn;
  if (!ISO_DATE.test(asOfDate) || asOfDate < endsOn) asOfDate = endsOn;
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

function reportQuery(search: URLSearchParams) {
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

function effectiveEndsOn(search: URLSearchParams) {
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

function actualSummaryQuery(search: URLSearchParams) {
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

function projectQuery(search: URLSearchParams) {
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
/** Return the minor-amount string only when it represents a non-zero value;
 *  otherwise return undefined so that the || fallback chain works correctly
 *  ("0" is truthy in JS which used to block the fallback). */
function nonZeroMinor(value: string | null | undefined): string | undefined {
  if (value == null) return undefined;
  try {
    return BigInt(value) !== 0n ? value : undefined;
  } catch {
    return undefined;
  }
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

function percent(numerator: bigint, denominator: bigint) {
  if (denominator <= 0n) return "N/A";
  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(Number((numerator * 1000n) / denominator) / 10)}%`;
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
}: {
  title: string;
  value: string;
  description: string;
  href: string;
  status?: string;
  provisional?: boolean;
  onQuick?: () => void;
}) {
  const formattedStatus = formatStatusBadge(status);

  const cardElement = (
    <Card className="group relative flex h-full flex-col justify-between transition-all hover:border-primary/50 hover:bg-accent/30 active:scale-[0.99] cursor-pointer">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="transition-colors group-hover:text-primary">{title}</CardTitle>
          <div className="flex shrink-0 items-center gap-1.5">
            {provisional ? (
              <Badge variant="secondary" className="text-xs font-normal">
                Tạm tính
              </Badge>
            ) : null}
            {formattedStatus ? (
              <Badge variant="outline" className="text-xs font-normal">
                {formattedStatus}
              </Badge>
            ) : null}
            <ArrowRight className="h-4 w-4 text-muted-foreground opacity-50 transition-all group-hover:translate-x-0.5 group-hover:text-primary group-hover:opacity-100" />
          </div>
        </div>
        <CardDescription className="min-h-[2.25rem] line-clamp-2">{description}</CardDescription>
      </CardHeader>
      <CardContent className="pb-4 pt-0">
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
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

    const [executive, performance, projects, aging, operating, actualSummary] =
      await Promise.allSettled([
        client.data<ExecutiveMetricsContract>(`reports/executive-metrics?${rq}`),
        client.data<PerformanceComparisonContract>(`reports/performance-comparisons?${pq}`),
        client.data<ProjectProfitabilityReport>(`reports/project-profitability?${jq}`),
        client.data<AgingReportContract>(
          `reports/ar-aging?asOf=${encodeURIComponent(asOf)}&limit=100`,
        ),
        client.data<OperatingDashboardWire>(`reports/operating-dashboard?${oq}`),
        client.data<ActualFactSummaryWire>(`planning-actual-facts/summary?${aq}`),
      ]);

    const next: DashboardData = {
      executive: executive.status === "fulfilled" ? executive.value : undefined,
      performance: performance.status === "fulfilled" ? performance.value : undefined,
      projects: projects.status === "fulfilled" ? projects.value : undefined,
      aging: aging.status === "fulfilled" ? aging.value : undefined,
      operating: operating.status === "fulfilled" ? operating.value : undefined,
      actualSummary: actualSummary.status === "fulfilled" ? actualSummary.value : undefined,
      failures: {
        executive: executive.status === "rejected" ? String(executive.reason) : "",
        performance: performance.status === "rejected" ? String(performance.reason) : "",
        projects: projects.status === "rejected" ? String(projects.reason) : "",
        aging: aging.status === "rejected" ? String(aging.reason) : "",
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

export function ExecutiveDashboardWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const { data, loading, error, search } = useDashboardData();
  const [filters, setFilters] = useState(false);
  const [preview, setPreview] = useState<Preview>();
  const currentBasis = search.get("actualBasis") ?? "invoiced";
  const handleBasisChange = (val: string) => {
    const next = new URLSearchParams(search);
    next.set("actualBasis", val);
    router.replace(`${pathname}?${next.toString()}`);
  };
  const q = search.toString();
  const executive = data.executive;
  const performance = data.performance;
  const operating = data.operating;
  const usingOperatingFallback = !operating;
  const projects = data.projects?.items ?? [];
  const recognizedMinor = sumMinor(projects.map((item) => item.recognizedRevenueMinor));
  const invoicedMinor = sumMinor(projects.map((item) => item.invoicedRevenueMinor));
  const recognizedDisplayMinor = projects.some((item) => item.recognizedRevenueMinor != null)
    ? recognizedMinor
    : performance?.actualVsFullTarget.numeratorMinor;
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
  const fallbackBacklogMinor = sumMinor(
    projects.map((item) => {
      const budget = BigInt(item.budgetRevenueMinor ?? "0");
      const invoiced = BigInt(item.invoicedRevenueMinor ?? "0");
      return budget > invoiced ? (budget - invoiced).toString() : "0";
    }),
  );
  const overdueMinor = operating?.collections.overdueMinor ?? fallbackOverdueMinor;
  const overdueCount = (data.aging?.items ?? []).filter(
    (item) => (item.daysOverdue ?? 0) > 0,
  ).length;
  const dso = operating
    ? operating.collections.dsoDays == null
      ? "N/A"
      : `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(operating.collections.dsoDays)} ngày`
    : fallbackDso;
  const backlogMinor = operating?.backlog.remainingMinor ?? fallbackBacklogMinor;
  const fallbackProjectRisks = [...projects]
    .filter((item) => BigInt(item.overrunAmountMinor ?? "0") > 0n || item.confidenceCodes.length)
    .sort((a, b) =>
      BigInt(a.overrunAmountMinor ?? "0") > BigInt(b.overrunAmountMinor ?? "0") ? -1 : 1,
    )
    .slice(0, 5);
  const projectBurnRows = operating?.projectBurn.slice(0, 5);
  const hasProjectBurnRows = operating
    ? Boolean(projectBurnRows?.length)
    : fallbackProjectRisks.length > 0;
  const flaggedPerformance =
    performance?.confidenceFlags.filter(
      (f) => (f.severity as string) === "critical" || !f.code.startsWith("missing_"),
    ).length ?? 0;
  const flagged =
    flaggedPerformance +
    (data.projects?.items.filter((item) => item.confidenceCodes.length).length ?? 0) +
    (data.aging?.exceptions.length ?? 0) +
    (operating?.dataQuality.pendingCount ?? 0);
  const sourceMonthly = operating?.sourceControls?.monthly ?? [];
  const startsOnMonth = (search.get("startsOn") ?? "2025-01-01").slice(0, 7);
  const endsOnMonth = (search.get("endsOn") ?? "2025-12-31").slice(0, 7);
  let filteredMonthly: readonly any[] = sourceMonthly.filter(
    (row) => row.period >= startsOnMonth && row.period <= endsOnMonth,
  );
  if (filteredMonthly.length === 0 && operating?.financials?.monthly) {
    filteredMonthly = operating.financials.monthly.filter(
      (row) => row.period >= startsOnMonth && row.period <= endsOnMonth,
    );
  }
  const profitabilityMonthly = filteredMonthly.filter(
    (row) => row.kind === "profitability_control",
  );
  const baseMonthly = profitabilityMonthly.length ? profitabilityMonthly : filteredMonthly;

  const chartPoints = baseMonthly.map((row) => ({
    label: row.period,
    valueMinor: row.revenueMinor,
  }));
  const comparisonPoints = [
    { label: "Kỳ trước", valueMinor: performance?.monthOverMonth.denominatorMinor },
    { label: "Thực tế kỳ này", valueMinor: performance?.actualVsFullTarget.numeratorMinor },
    {
      label: "Dự báo giữ lại",
      valueMinor: performance?.actualVsRetainedForecast.denominatorMinor,
    },
  ].filter((point): point is { label: string; valueMinor: string } => point.valueMinor != null);
  const displayedChartPoints = chartPoints.length ? chartPoints : comparisonPoints;

  const categoryData = operating?.sourceControls?.expenseCategories ?? [];
  const periods = new Set<string>();
  for (const row of filteredMonthly) periods.add(row.period);
  for (const cat of categoryData) {
    for (const amt of cat.monthlyAmounts) {
      if (amt.period >= startsOnMonth && amt.period <= endsOnMonth) {
        periods.add(amt.period);
      }
    }
  }
  const allPeriods = [...periods].sort();

  const expensePoints = allPeriods.map((period) => {
    const row = filteredMonthly.find((r) => r.period === period);
    const rowExpense = BigInt(row?.expenseMinor ?? "0");
    const categories: Record<string, bigint> = {};
    let assignedMinor = 0n;

    for (const cat of categoryData) {
      const amtStr = cat.monthlyAmounts.find((a) => a.period === period)?.amountMinor;
      if (amtStr) {
        const amt = BigInt(amtStr);
        const catName = cat.category || "Khác";
        categories[catName] = (categories[catName] || 0n) + amt;
        assignedMinor += amt;
      }
    }

    const totalMinor = rowExpense > assignedMinor ? rowExpense : assignedMinor;
    if (assignedMinor < totalMinor) {
      categories["Chưa phân bổ"] = totalMinor - assignedMinor;
    }

    return {
      month: period,
      categories,
    };
  });
  return (
    <ModulePage
      title="Tổng quan điều hành"
      description="Tổng quan chỉ số doanh thu, công nợ, hiệu suất và sức khỏe tài chính doanh nghiệp."
      section="Điều hành"
    >
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
              Mở Finance review để xem các ngoại lệ từ báo cáo nguồn và dữ liệu import.
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
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <MetricCard
                title="Giá trị đã xuất hóa đơn"
                value={money(
                  nonZeroMinor(data.actualSummary?.amountMinor) ??
                    nonZeroMinor(operating?.clientConcentration.totalRevenueMinor) ??
                    nonZeroMinor(performance?.actualVsFullTarget.numeratorMinor) ??
                    invoicedMinor,
                  data.actualSummary?.currency ??
                    operating?.currency ??
                    performance?.currency ??
                    data.projects?.currency,
                )}
                description="Giá trị hóa đơn bán ra đã phát hành; không đồng nghĩa đã thu tiền"
                href={`/reports/project-profitability?${q}`}
                provisional={usingOperatingFallback}
              />
              <MetricCard
                title="Doanh thu đã ghi nhận"
                value={money(
                  search.get("actualBasis") === "recognized"
                    ? (nonZeroMinor(data.actualSummary?.amountMinor) ?? recognizedDisplayMinor)
                    : recognizedDisplayMinor,
                  data.actualSummary?.currency ?? data.projects?.currency ?? performance?.currency,
                )}
                description={
                  operating?.financials.recognitionEventCount
                    ? "Phần giá trị hợp đồng đã đủ điều kiện ghi nhận doanh thu"
                    : "Chưa có mốc ghi nhận doanh thu đã post"
                }
                href={`/reports/project-profitability?${q}`}
                status={
                  operating?.financials.recognitionEventCount
                    ? performance?.actualVsFullTarget.status
                    : "Chưa có dữ liệu"
                }
              />
              <MetricCard
                title="Cảnh báo Thuế TNDN (Tạm tính 20%)"
                value={`~${money(
                  (BigInt(operating?.financials.netProfitMinor ?? "0") > 0n
                    ? (BigInt(operating?.financials.netProfitMinor ?? "0") * 20n) / 100n
                    : 0n
                  ).toString(),
                  operating?.currency ?? data.projects?.currency,
                )}`}
                description={`Chi phí hợp lệ: ${money(operating?.financials.expenseMinor ?? "0", operating?.currency)}`}
                href="/reports/tax/expense-exceptions"
                status="Cần rà soát"
                provisional
              />
              <MetricCard
                title="Công nợ quá hạn"
                value={money(overdueMinor, data.aging?.baseCurrency)}
                description={`DSO: ${dso}`}
                href={`/receivables?asOf=${search.get("asOfDate") ?? "2026-08-31"}`}
                status={overdueCount ? `${overdueCount} khoản quá hạn` : data.aging?.tieStatus}
                provisional={usingOperatingFallback}
              />
              <MetricCard
                title="Tiền mặt khả dụng"
                value={money(
                  executive?.unrestrictedCashMinor ?? operating?.financials.unrestrictedCashMinor,
                  executive?.currency ?? operating?.currency,
                )}
                description={
                  executive
                    ? `Burn: ${money(executive.netBurnMinor, executive.currency)}/tháng`
                    : "Tổng số dư tiền mặt và tiền gửi khả dụng"
                }
                href={`/reports/financial-statements/cash-flow/current?${q}`}
                status={executive?.runwayStatus}
              />
              <MetricCard
                title="Runway"
                value={months(executive?.runwayMonthsThousandths)}
                description="Thời gian duy trì dòng tiền với tốc độ chi tiêu hiện tại"
                href={`/reports/financial-statements/cash-flow/current?${q}`}
                status={executive?.runwayStatus}
              />
              <MetricCard
                title="Giá trị hợp đồng chưa xuất hóa đơn"
                value={money(backlogMinor, data.projects?.currency)}
                description={
                  operating
                    ? `Tổng hợp từ ${operating.backlog.projectCount} dự án có hợp đồng`
                    : "Phần giá trị hợp đồng còn lại chưa được lập hóa đơn"
                }
                href={`/reports/project-profitability?${q}`}
                provisional={usingOperatingFallback}
              />
              <MetricCard
                title="Lợi nhuận fully loaded"
                value={money(
                  nonZeroMinor(data.projects?.totals.fullyLoadedProfitMinor) ??
                    operating?.financials.netProfitMinor,
                  data.projects?.currency ?? operating?.currency,
                )}
                description={
                  operating?.financials.approvedBudgetCount &&
                  operating.financials.postedOverheadRunCount
                    ? "Lợi nhuận ròng đã phân bổ đầy đủ chi phí"
                    : "Lợi nhuận sổ sách kế toán"
                }
                href={`/reports/project-profitability?${q}`}
                status={`${projects.length} dự án`}
              />
              <MetricCard
                title="ROS"
                value={ratio(executive?.ros.valueBps ?? operating?.financials.rosBps)}
                description="Tỷ suất lợi nhuận trên doanh thu (Return on Sales)"
                href={`/reports/financial-statements/profit-and-loss/current?${q}`}
                status={
                  executive?.ros.status ??
                  (operating?.financials.rosBps == null ? undefined : "Dồn tích")
                }
              />
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Budget burn & EAC dự án</CardTitle>
                <CardDescription>
                  Các dự án có overrun hoặc cảnh báo chất lượng dữ liệu.
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {hasProjectBurnRows ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Dự án</TableHead>
                        <TableHead>Budget burn</TableHead>
                        <TableHead>EAC</TableHead>
                        <TableHead>Phương pháp</TableHead>
                        <TableHead className="text-right">Chi tiết</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(operating ? (projectBurnRows ?? []) : fallbackProjectRisks).map(
                        (project) => {
                          const isOperating = isOperatingProject(project);
                          const projectId = project.projectId ?? "";
                          const cost = BigInt(
                            isOperating
                              ? (project.actualCostMinor ?? "0")
                              : (project.directCostMinor ?? "0"),
                          );
                          const budget = BigInt(project.budgetCostMinor ?? "0");
                          const eac = isOperating
                            ? (project.estimateAtCompletionMinor ?? "0")
                            : (budget + BigInt(project.overrunAmountMinor ?? "0")).toString();
                          return (
                            <TableRow key={projectId}>
                              <TableCell>
                                {isOperating
                                  ? (project.name ?? project.code)
                                  : (project.projectName ?? project.projectCode)}
                              </TableCell>
                              <TableCell>
                                {isOperating && project.burnBps != null
                                  ? ratio(project.burnBps)
                                  : percent(cost, budget)}
                              </TableCell>
                              <TableCell>
                                {money(
                                  eac,
                                  operating?.currency ??
                                    (!isOperating ? project.currency : undefined),
                                )}
                              </TableCell>
                              <TableCell>
                                {isOperating ? (
                                  <Badge variant="outline">
                                    {project.eacMethod ?? "operating-dashboard"}
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary">Fallback</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button asChild size="sm" variant="outline">
                                  <Link
                                    href={`/reports/project-profitability/projects/${encodeURIComponent(projectId)}?${q}`}
                                  >
                                    Mở dự án
                                  </Link>
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        },
                      )}
                    </TableBody>
                  </Table>
                ) : (
                  <Empty>
                    <EmptyHeader>
                      <EmptyTitle>Không có dự án cảnh báo</EmptyTitle>
                      <EmptyDescription>
                        Chưa phát hiện overrun hoặc thiếu dữ liệu trong kỳ.
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
                href="/documents?type=sales_invoice"
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
        <MonthlyCategoryStackedChart
          title="Thống kê chi phí"
          description="Dữ liệu chi phí phân bổ theo tháng từ nguồn Operating Dashboard."
          points={expensePoints}
          currency={operating?.currency ?? data.projects?.currency ?? "VND"}
          href="/documents?type=purchase_invoice"
        />
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
        href: `/reports/project-profitability/projects/${encodeURIComponent(project.projectId)}?${q}`,
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
          <CardContent className="overflow-x-auto">
            {loading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mức độ</TableHead>
                    <TableHead>Module</TableHead>
                    <TableHead>Vấn đề</TableHead>
                    <TableHead>Nguồn</TableHead>
                    <TableHead className="text-right">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Badge variant={row.severity === "critical" ? "destructive" : "outline"}>
                          {row.severity}
                        </Badge>
                      </TableCell>
                      <TableCell>{row.module}</TableCell>
                      <TableCell>{row.issue}</TableCell>
                      <TableCell className="max-w-72 break-all font-mono text-xs">
                        {row.source || "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" asChild>
                          <Link href={row.href}>Mở module</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
