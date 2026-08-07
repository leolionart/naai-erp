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
import { ArrowRight, ChevronLeft, ChevronRight, Filter, Info, ListChecks } from "lucide-react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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

type DashboardData = Readonly<{
  executive?: ExecutiveMetricsContract;
  performance?: PerformanceComparisonContract;
  projects?: ProjectProfitabilityReport;
  aging?: AgingReportContract;
  operating?: OperatingDashboardWire;
  failures?: Readonly<
    Record<"executive" | "performance" | "projects" | "aging" | "operating", string>
  >;
  searchKey?: string;
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

const currentMonth = () => "2025-01";
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

function shiftedMonth(anchorMonth: string, kind: PeriodKind, delta: number) {
  const [year, month] = anchorMonth.split("-").map(Number);
  const step = kind === "year" ? 12 : kind === "quarter" ? 3 : 1;
  const shifted = new Date(Date.UTC(year, month - 1 + delta * step, 1));
  return shifted.toISOString().slice(0, 7);
}

function resolvedDashboardSearch(
  input: URLSearchParams,
  _sourceControls?: OperatingDashboardWire["sourceControls"],
) {
  const search = new URLSearchParams(input);
  const requestedPeriod = search.get("periodId");
  const periodMatch = /^(?:CAL-)?(\d{4}-(?:0[1-9]|1[0-2]))$/.exec(
    requestedPeriod ?? currentMonth(),
  );
  const period = periodMatch?.[1] ?? currentMonth();
  if (!periodMatch || !requestedPeriod) search.set("periodId", `CAL-${period}`);
  if (!search.has("actualBasis")) search.set("actualBasis", "invoiced");

  const kind = (search.get("periodKind") as PeriodKind | null) ?? "year";
  if (!search.has("periodKind")) search.set("periodKind", kind);

  const range = periodRange(period, kind);
  let startsOn = search.get("startsOn") ?? range.startsOn;
  let endsOn = search.get("endsOn") ?? range.endsOn;

  if (!ISO_DATE.test(startsOn) || !ISO_DATE.test(endsOn) || startsOn > endsOn) {
    startsOn = range.startsOn;
    endsOn = range.endsOn;
  }
  let asOfDate = search.get("asOfDate") ?? endsOn;
  if (!ISO_DATE.test(asOfDate) || asOfDate < endsOn) asOfDate = endsOn;
  search.set("startsOn", startsOn);
  search.set("endsOn", endsOn);
  search.set("asOfDate", asOfDate);
  return search;
}

function reportQuery(search: URLSearchParams) {
  const query = new URLSearchParams();
  const endsOn = search.get("endsOn") ?? "2026-08-31";
  query.set("startsOn", search.get("startsOn") ?? "2026-08-01");
  query.set("endsOn", endsOn);
  query.set("asOfInstant", `${search.get("asOfDate") ?? endsOn}T16:59:59.999Z`);
  query.set("framework", "TT133");
  for (const key of ["serviceLineCode", "teamId", "ownerId", "projectId"]) {
    const value = search.get(key);
    if (value) query.set(key, value);
  }
  return query;
}

function performanceQuery(search: URLSearchParams) {
  const query = new URLSearchParams();
  query.set("periodId", search.get("periodId") ?? "CAL-2026-08");
  query.set("periodBasis", "calendar");
  query.set("actualBasis", search.get("actualBasis") ?? "invoiced");
  const asOfDate = search.get("asOfDate") ?? search.get("endsOn") ?? "2026-08-31";
  query.set("asOfInstant", `${asOfDate}T16:59:59.999Z`);
  for (const key of ["serviceLineCode", "teamId", "ownerId"]) {
    const value = search.get(key);
    if (value) query.set(key, value);
  }
  return query;
}

function projectQuery(search: URLSearchParams) {
  const query = new URLSearchParams();
  query.set("periodStart", search.get("startsOn") ?? "2026-08-01");
  query.set("periodEnd", search.get("endsOn") ?? "2026-08-31");
  query.set("asOf", search.get("asOfDate") ?? "2026-08-31");
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
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {provisional ? <Badge variant="secondary">Tạm tính</Badge> : null}
          {status ? <Badge variant="outline">{status}</Badge> : null}
        </div>
      </CardContent>
      <CardFooter>
        {onQuick ? (
          <Button variant="outline" className="w-full" onClick={onQuick}>
            Xem nhanh
          </Button>
        ) : (
          <Button asChild variant="outline" className="w-full">
            <Link href={href}>
              Mở drill-down <ArrowRight data-icon="inline-end" />
            </Link>
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

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
  function apply(data: FormData) {
    const q = new URLSearchParams();
    for (const key of [
      "periodId",
      "actualBasis",
      "startsOn",
      "endsOn",
      "asOfDate",
      "serviceLineCode",
    ]) {
      const value = String(data.get(key) ?? "").trim();
      if (value) q.set(key, value);
    }
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
            <p className="text-sm text-muted-foreground">
              Basis và dimensions nâng cao được giữ trên URL.
            </p>
          </div>
          <FieldGroup className="p-4">
            <Field>
              <FieldLabel htmlFor="dash-period">Period ID</FieldLabel>
              <Input
                id="dash-period"
                name="periodId"
                defaultValue={search.get("periodId") ?? "CAL-2026-08"}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="dash-start">Từ ngày</FieldLabel>
              <Input
                id="dash-start"
                type="date"
                name="startsOn"
                defaultValue={search.get("startsOn") ?? "2026-08-01"}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="dash-basis">Basis thực tế</FieldLabel>
              <Select name="actualBasis" defaultValue={search.get("actualBasis") ?? "invoiced"}>
                <SelectTrigger id="dash-basis">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="invoiced">Đã xuất hóa đơn</SelectItem>
                    <SelectItem value="recognized">Đã ghi nhận</SelectItem>
                    <SelectItem value="collected">Đã thu tiền</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="dash-end">Đến ngày</FieldLabel>
              <Input
                id="dash-end"
                type="date"
                name="endsOn"
                defaultValue={search.get("endsOn") ?? "2026-08-31"}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="dash-asof">As of</FieldLabel>
              <Input
                id="dash-asof"
                type="date"
                name="asOfDate"
                defaultValue={search.get("asOfDate") ?? "2026-08-31"}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="dash-service">Service line</FieldLabel>
              <Input
                id="dash-service"
                name="serviceLineCode"
                defaultValue={search.get("serviceLineCode") ?? ""}
              />
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
    const jq = projectQuery(search);
    const asOf = search.get("asOfDate") ?? "2026-08-31";
    const oq = new URLSearchParams({
      asOf,
      startsOn: search.get("startsOn") ?? "2026-08-01",
      endsOn: search.get("endsOn") ?? "2026-08-31",
      limit: "20",
    });
    const [executive, performance, projects, aging, operating] = await Promise.allSettled([
      client.data<ExecutiveMetricsContract>(`reports/executive-metrics?${rq}`),
      client.data<PerformanceComparisonContract>(`reports/performance-comparisons?${pq}`),
      client.data<ProjectProfitabilityReport>(`reports/project-profitability?${jq}`),
      client.data<AgingReportContract>(
        `reports/ar-aging?asOf=${encodeURIComponent(asOf)}&limit=100`,
      ),
      client.data<OperatingDashboardWire>(`reports/operating-dashboard?${oq}`),
    ]);
    const next: DashboardData = {
      executive: executive.status === "fulfilled" ? executive.value : undefined,
      performance: performance.status === "fulfilled" ? performance.value : undefined,
      projects: projects.status === "fulfilled" ? projects.value : undefined,
      aging: aging.status === "fulfilled" ? aging.value : undefined,
      operating: operating.status === "fulfilled" ? operating.value : undefined,
      failures: {
        executive: executive.status === "rejected" ? String(executive.reason) : "",
        performance: performance.status === "rejected" ? String(performance.reason) : "",
        projects: projects.status === "rejected" ? String(projects.reason) : "",
        aging: aging.status === "rejected" ? String(aging.reason) : "",
        operating: operating.status === "rejected" ? String(operating.reason) : "",
      },
      searchKey: search.toString(),
    };
    setData(next);
    if (!next.executive && !next.performance && !next.projects && !next.aging && !next.operating) {
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
  const { data, loading, error, search } = useDashboardData();
  const [filters, setFilters] = useState(false);
  const [preview, setPreview] = useState<Preview>();
  const router = useRouter();
  const pathname = usePathname();
  const periodKind = (search.get("periodKind") as PeriodKind | null) ?? "year";
  const requestedAnchor = (search.get("periodId") ?? `CAL-${currentMonth()}`).replace(/^CAL-/, "");
  const anchorMonth = /^\d{4}-(?:0[1-9]|1[0-2])$/.test(requestedAnchor)
    ? requestedAnchor
    : currentMonth();
  const selectedPeriod = periodRange(anchorMonth, periodKind);
  function setPeriod(kind: PeriodKind, delta = 0) {
    const nextAnchor = shiftedMonth(anchorMonth, kind, delta);
    const range = periodRange(nextAnchor, kind);
    const next = new URLSearchParams(search);
    next.set("periodKind", kind);
    next.set("period", range.label);
    next.set("periodId", `CAL-${nextAnchor}`);
    next.set("startsOn", range.startsOn);
    next.set("endsOn", range.endsOn);
    next.set("asOfDate", range.endsOn);
    router.replace(`${pathname}?${next}`);
  }

  const now = new Date();
  const currentYearVal = now.getFullYear();
  const currentMonthVal = now.getMonth() + 1;
  const nextAnchor = shiftedMonth(anchorMonth, periodKind, 1);
  const [nextYear, nextMonth] = nextAnchor.split("-").map(Number);
  const isFuture =
    periodKind === "year"
      ? nextYear > currentYearVal
      : nextYear > currentYearVal || (nextYear === currentYearVal && nextMonth > currentMonthVal);
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
      const recognized = BigInt(item.recognizedRevenueMinor ?? "0");
      return budget > recognized ? (budget - recognized).toString() : "0";
    }),
  );
  const clientRevenue = new Map<string, bigint>();
  for (const project of projects) {
    const client = project.clientName ?? project.clientId ?? "Chưa phân loại";
    clientRevenue.set(
      client,
      (clientRevenue.get(client) ?? 0n) + BigInt(project.recognizedRevenueMinor ?? "0"),
    );
  }
  const topClient = [...clientRevenue.entries()].sort((a, b) => (a[1] > b[1] ? -1 : 1))[0];
  const fallbackTopClientShare = topClient ? percent(topClient[1], BigInt(recognizedMinor)) : "N/A";
  const overdueMinor = operating?.collections.overdueMinor ?? fallbackOverdueMinor;
  const dso = operating
    ? operating.collections.dsoDays == null
      ? "N/A"
      : `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(operating.collections.dsoDays)} ngày`
    : fallbackDso;
  const backlogMinor = operating?.backlog.remainingMinor ?? fallbackBacklogMinor;
  const operatingTopClient = operating?.clientConcentration.clients[0];
  const topClientName = operatingTopClient?.clientName ?? topClient?.[0];
  const topClientShare = operating
    ? ratio(operating.clientConcentration.topClientShareBps)
    : fallbackTopClientShare;
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
  const flagged =
    (performance?.confidenceFlags.length ?? 0) +
    (data.projects?.items.filter((item) => item.confidenceCodes.length).length ?? 0) +
    (data.aging?.exceptions.length ?? 0) +
    (operating?.dataQuality.pendingCount ?? 0);
  const sourceMonthly = operating?.sourceControls?.monthly ?? [];
  const profitabilityMonthly = sourceMonthly.filter((row) => row.kind === "profitability_control");
  const chartPoints = (profitabilityMonthly.length ? profitabilityMonthly : sourceMonthly).map(
    (row) => ({ label: row.period, valueMinor: row.revenueMinor }),
  );
  const comparisonPoints = [
    { label: "Kỳ trước", valueMinor: performance?.monthOverMonth.denominatorMinor },
    { label: "Thực tế kỳ này", valueMinor: performance?.actualVsFullTarget.numeratorMinor },
    {
      label: "Dự báo giữ lại",
      valueMinor: performance?.actualVsRetainedForecast.denominatorMinor,
    },
  ].filter((point): point is { label: string; valueMinor: string } => point.valueMinor != null);
  const displayedChartPoints = chartPoints.length ? chartPoints : comparisonPoints;
  return (
    <ModulePage
      title="Tổng quan điều hành"
      description="KPI quản trị lấy nguyên giá trị, formula version và source boundary từ report APIs."
      section="Điều hành"
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup
              type="single"
              value={periodKind}
              onValueChange={(value: string) => value && setPeriod(value as PeriodKind)}
              variant="outline"
              size="sm"
              aria-label="Chọn cấp kỳ"
            >
              <ToggleGroupItem value="year">Năm</ToggleGroupItem>
              <ToggleGroupItem value="quarter">Quý</ToggleGroupItem>
              <ToggleGroupItem value="month">Tháng</ToggleGroupItem>
            </ToggleGroup>
            <div className="flex items-center gap-1">
              <Button
                size="icon-sm"
                variant="outline"
                aria-label="Kỳ trước"
                onClick={() => setPeriod(periodKind, -1)}
              >
                <ChevronLeft />
              </Button>
              <Badge variant="outline" className="min-w-24 justify-center">
                {selectedPeriod.label}
              </Badge>
              <Button
                size="icon-sm"
                variant="outline"
                aria-label="Kỳ sau"
                onClick={() => setPeriod(periodKind, 1)}
                disabled={isFuture}
              >
                <ChevronRight />
              </Button>
            </div>
            <Badge variant="secondary">Basis: {search.get("actualBasis") ?? "invoiced"}</Badge>
            {search.get("serviceLineCode") ? (
              <Badge variant="outline">Service line: {search.get("serviceLineCode")}</Badge>
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
                title="Doanh thu đã xuất hóa đơn"
                value={money(
                  operating?.clientConcentration.totalRevenueMinor ?? invoicedMinor,
                  operating?.currency ?? data.projects?.currency,
                )}
                description="Tổng tiền hóa đơn GTGT đã xuất trong kỳ"
                href={`/dashboard/drilldown/revenue?${q}`}
                provisional={usingOperatingFallback}
              />
              <MetricCard
                title="Doanh thu ghi nhận (Theo mốc hợp đồng)"
                value={money(
                  recognizedDisplayMinor,
                  data.projects?.currency ?? performance?.currency,
                )}
                description={
                  performance?.actualVsFullTarget.formulaVersion ??
                  "Giá trị nghiệm thực tế theo dự án"
                }
                href={`/dashboard/drilldown/revenue?${q}`}
                status={performance?.actualVsFullTarget.status}
              />
              <MetricCard
                title="Cảnh báo Thuế TNDN (Tạm tính 20%)"
                value={`~${money(
                  (BigInt(operating?.clientConcentration.totalRevenueMinor ?? invoicedMinor) >
                  BigInt(data.projects?.totals.directCostMinor ?? "0")
                    ? ((BigInt(operating?.clientConcentration.totalRevenueMinor ?? invoicedMinor) -
                        BigInt(data.projects?.totals.directCostMinor ?? "0")) *
                        20n) /
                      100n
                    : 0n
                  ).toString(),
                  operating?.currency ?? data.projects?.currency,
                )}`}
                description={`Chi phí có HĐ: ${money(data.projects?.totals.directCostMinor ?? "0", data.projects?.currency)}`}
                href="/reports/tax/expense-exceptions"
                status="Cần rà soát"
                provisional
              />
              <MetricCard
                title="Công nợ quá hạn"
                value={money(overdueMinor, data.aging?.baseCurrency)}
                description={`DSO: ${dso}`}
                href={`/receivables?asOf=${search.get("asOfDate") ?? "2026-08-31"}`}
                status={flagged ? `${flagged} khoản cần thu` : data.aging?.tieStatus}
                provisional={usingOperatingFallback}
                onQuick={() =>
                  setPreview({
                    title: "Công nợ quá hạn & DSO",
                    description:
                      "Thông tin quản trị nhanh từ AR aging và doanh thu ghi nhận trong kỳ.",
                    sourceIds:
                      data.aging?.items
                        .filter((item) => (item.daysOverdue ?? 0) > 0)
                        .map((item) => item.id) ?? [],
                    href: `/receivables?asOf=${search.get("asOfDate") ?? "2026-08-31"}`,
                    facts: [
                      {
                        label: "Công nợ quá hạn",
                        value: money(overdueMinor, data.aging?.baseCurrency),
                      },
                      { label: usingOperatingFallback ? "DSO fallback" : "DSO", value: dso },
                    ],
                  })
                }
              />
              <MetricCard
                title="Tiền mặt khả dụng"
                value={money(executive?.unrestrictedCashMinor, executive?.currency)}
                description={`Burn: ${money(executive?.netBurnMinor, executive?.currency)}`}
                href={`/dashboard/drilldown/runway?${q}`}
                status={executive?.runwayStatus}
              />
              <MetricCard
                title="Runway"
                value={months(executive?.runwayMonthsThousandths)}
                description={executive?.runwayFormulaVersion ?? "Report API unavailable"}
                href={`/dashboard/drilldown/runway?${q}`}
                status={executive?.runwayStatus}
              />
              <MetricCard
                title="Backlog hợp đồng"
                value={money(backlogMinor, data.projects?.currency)}
                description={
                  operating
                    ? `${operating.backlog.projectCount} dự án có hợp đồng`
                    : "Budget revenue chưa ghi nhận"
                }
                href={`/reports/project-profitability?${q}`}
                provisional={usingOperatingFallback}
              />
              <MetricCard
                title="Tập trung khách hàng"
                value={topClientShare}
                description={
                  topClientName
                    ? `Khách hàng lớn nhất: ${topClientName}`
                    : "Chưa có doanh thu theo khách hàng"
                }
                href={`/customers`}
                provisional={usingOperatingFallback}
                onQuick={() =>
                  setPreview({
                    title: "Tập trung khách hàng",
                    description: "Tỷ trọng doanh thu ghi nhận của khách hàng lớn nhất trong kỳ.",
                    sourceIds: [],
                    href: "/customers",
                    facts: [
                      { label: "Khách hàng lớn nhất", value: topClientName ?? "N/A" },
                      { label: "Tỷ trọng", value: topClientShare },
                    ],
                  })
                }
              />
              <MetricCard
                title="Lợi nhuận fully loaded"
                value={money(data.projects?.totals.fullyLoadedProfitMinor, data.projects?.currency)}
                description="Project profitability report API"
                href={`/reports/project-profitability?${q}`}
                status={`${projects.length} dự án`}
              />
              <MetricCard
                title="ROS"
                value={ratio(executive?.ros.valueBps)}
                description={executive?.ros.formulaVersion ?? "Report API unavailable"}
                href={`/dashboard/drilldown/ros?${q}`}
                status={executive?.ros.status}
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
          <CardHeader>
            <CardTitle>Xu hướng doanh thu</CardTitle>
            <CardDescription>
              Các điểm actual/comparison/forecast lấy từ Performance Comparison API; chart không
              tính lại KPI.
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
          <CardFooter>
            {operating?.sourceControls ? (
              <Badge variant="outline">
                {operating.sourceControls.rowCount} dòng workbook chưa xác nhận kế toán
              </Badge>
            ) : null}
            <Button
              variant="outline"
              onClick={() =>
                setPreview({
                  title: "Nguồn xu hướng doanh thu",
                  description: performance?.formulaVersion ?? "Performance Comparison API",
                  sourceIds: performance?.sourceIds ?? [],
                  href: `/dashboard/drilldown/revenue?${q}`,
                })
              }
            >
              <Info data-icon="inline-start" />
              Xem nguồn nhanh
            </Button>
          </CardFooter>
        </Card>
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
    ...(data.performance?.confidenceFlags.map((flag) => ({
      id: `performance:${flag.code}`,
      severity: flag.severity,
      module: "Hiệu suất kế hoạch",
      issue: flag.reason,
      source: flag.sourceIds.join(", "),
      href: `/reports/performance/${encodeURIComponent(data.performance!.period.id)}?${q}`,
    })) ?? []),
    ...(data.operating?.dataQuality.byFlag.map((flag) => ({
      id: `data-quality:${flag.flag}`,
      severity: "warning",
      module: "Dữ liệu import",
      issue: `${flag.flag}: ${flag.count} bản ghi chờ bổ sung`,
      source: "Operating Dashboard API",
      href: "/imports/review",
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
      canonicalHref: `/reports/executive-metrics/profitability?${q}`,
    },
    runway: {
      title: "Cash Runway",
      value: months(executive?.runwayMonthsThousandths),
      formula: executive?.runwayFormulaVersion ?? "Executive Metrics API",
      sourceIds: executive?.sourceBoundary.sourceIds ?? [],
      canonicalHref: `/reports/executive-metrics/liquidity?${q}`,
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
  return (
    <ModulePage
      title={detail?.title ?? "Dashboard drill-down"}
      description="Giá trị, formula version và source IDs nguyên bản từ report API."
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
