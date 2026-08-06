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
import { AlertTriangle, ArrowRight, Filter, Info, ListChecks } from "lucide-react";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
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
}>;
type Preview = Readonly<{
  title: string;
  description: string;
  sourceIds: readonly string[];
  href: string;
}>;

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
  query.set("actualBasis", "recognized");
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

function MetricCard({
  title,
  value,
  description,
  href,
  status,
}: {
  title: string;
  value: string;
  description: string;
  href: string;
  status?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        {status ? (
          <Badge variant="outline" className="mt-3">
            {status}
          </Badge>
        ) : null}
      </CardContent>
      <CardFooter>
        <Button asChild variant="outline" className="w-full">
          <Link href={href}>
            Mở drill-down <ArrowRight data-icon="inline-end" />
          </Link>
        </Button>
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
    for (const key of ["periodId", "startsOn", "endsOn", "asOfDate", "serviceLineCode"]) {
      const value = String(data.get(key) ?? "").trim();
      if (value) q.set(key, value);
    }
    router.replace(`${pathname}?${q}`);
    onOpenChange(false);
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <form action={apply} className="flex h-full flex-col">
          <SheetHeader>
            <SheetTitle>Bộ lọc dashboard</SheetTitle>
            <SheetDescription>
              Kỳ và dimensions được giữ trên URL và truyền nguyên vẹn tới báo cáo nguồn.
            </SheetDescription>
          </SheetHeader>
          <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
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
          <SheetFooter>
            <Button type="submit">Áp dụng</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function PreviewDrawer({ preview, onClose }: { preview?: Preview; onClose(): void }) {
  return (
    <Drawer
      direction="right"
      open={Boolean(preview)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{preview?.title ?? "Nguồn dashboard"}</DrawerTitle>
          <DrawerDescription>{preview?.description}</DrawerDescription>
        </DrawerHeader>
        <div className="flex flex-col gap-3 px-4">
          <p className="text-sm font-medium">Source IDs</p>
          <div className="flex flex-wrap gap-2">
            {preview?.sourceIds.map((id) => (
              <Badge variant="outline" key={id} className="max-w-full break-all">
                {id}
              </Badge>
            ))}
          </div>
          {preview ? (
            <Button asChild>
              <Link href={preview.href}>Mở trang drill-down đầy đủ</Link>
            </Button>
          ) : null}
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
    const search = new URLSearchParams(key);
    const rq = reportQuery(search);
    const pq = performanceQuery(search);
    const jq = projectQuery(search);
    const asOf = search.get("asOfDate") ?? "2026-08-31";
    const [executive, performance, projects, aging] = await Promise.allSettled([
      client.data<ExecutiveMetricsContract>(`reports/executive-metrics?${rq}`),
      client.data<PerformanceComparisonContract>(`reports/performance-comparisons?${pq}`),
      client.data<ProjectProfitabilityReport>(`reports/project-profitability?${jq}`),
      client.data<AgingReportContract>(
        `reports/ar-aging?asOf=${encodeURIComponent(asOf)}&limit=100`,
      ),
    ]);
    const next: DashboardData = {
      executive: executive.status === "fulfilled" ? executive.value : undefined,
      performance: performance.status === "fulfilled" ? performance.value : undefined,
      projects: projects.status === "fulfilled" ? projects.value : undefined,
      aging: aging.status === "fulfilled" ? aging.value : undefined,
    };
    setData(next);
    if (!next.executive && !next.performance && !next.projects && !next.aging)
      setError("Không thể tải các báo cáo nguồn của dashboard.");
    setLoading(false);
  }, [client, hasToken, hydrated, key]);
  useEffect(() => void load(), [load]);
  return { data, loading, error, reload: load, search: new URLSearchParams(key) };
}

export function ExecutiveDashboardWorkspace() {
  const { data, loading, error, search } = useDashboardData();
  const [filters, setFilters] = useState(false);
  const [preview, setPreview] = useState<Preview>();
  const q = search.toString();
  const executive = data.executive;
  const performance = data.performance;
  const flagged =
    (performance?.confidenceFlags.length ?? 0) +
    (data.projects?.items.filter((item) => item.confidenceCodes.length).length ?? 0) +
    (data.aging?.exceptions.length ?? 0);
  const chartPoints = [
    performance?.monthOverMonth.denominatorMinor,
    performance?.actualVsFullTarget.numeratorMinor,
    performance?.actualVsRetainedForecast.denominatorMinor,
  ]
    .filter((value): value is string => value != null)
    .map(Number);
  return (
    <ModulePage
      title="Tổng quan điều hành"
      description="KPI quản trị lấy nguyên giá trị, formula version và source boundary từ report APIs."
      section="Điều hành"
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{search.get("periodId") ?? "CAL-2026-08"}</Badge>
            {search.get("serviceLineCode") ? (
              <Badge variant="outline">Service line: {search.get("serviceLineCode")}</Badge>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setFilters(true)}>
              <Filter data-icon="inline-start" />
              Bộ lọc
            </Button>
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
        {flagged ? (
          <Alert>
            <AlertTriangle />
            <AlertTitle>{flagged} tín hiệu cần rà soát</AlertTitle>
            <AlertDescription>
              Mở finance review để xử lý theo module nguồn; dashboard không tự sửa hoặc che số liệu.
            </AlertDescription>
          </Alert>
        ) : null}
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-48 w-full" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <MetricCard
              title="Doanh thu thực tế"
              value={money(performance?.actualVsFullTarget.numeratorMinor, performance?.currency)}
              description={
                performance?.actualVsFullTarget.formulaVersion ?? "Report API unavailable"
              }
              href={`/dashboard/drilldown/revenue?${q}`}
              status={performance?.actualVsFullTarget.status}
            />
            <MetricCard
              title="ROS"
              value={ratio(executive?.ros.valueBps)}
              description={executive?.ros.formulaVersion ?? "Report API unavailable"}
              href={`/dashboard/drilldown/ros?${q}`}
              status={executive?.ros.status}
            />
            <MetricCard
              title="Runway"
              value={months(executive?.runwayMonthsThousandths)}
              description={executive?.runwayFormulaVersion ?? "Report API unavailable"}
              href={`/dashboard/drilldown/runway?${q}`}
              status={executive?.runwayStatus}
            />
            <MetricCard
              title="Equity consumed"
              value={ratio(executive?.equityConsumed.valueBps)}
              description={executive?.equityConsumed.formulaVersion ?? "Report API unavailable"}
              href={`/dashboard/drilldown/equity-consumed?${q}`}
              status={executive?.equityConsumed.status}
            />
            <MetricCard
              title="Fully loaded profit"
              value={money(data.projects?.totals.fullyLoadedProfitMinor, data.projects?.currency)}
              description="Project profitability report API"
              href={`/reports/project-profitability?${q}`}
              status={`${data.projects?.items.length ?? 0} dự án`}
            />
            <MetricCard
              title="Công nợ phải thu"
              value={money(data.aging?.baseOutstandingTotalMinor, data.aging?.baseCurrency)}
              description="Posted-ledger AR aging"
              href={`/receivables?asOf=${search.get("asOfDate") ?? "2026-08-31"}`}
              status={data.aging?.tieStatus}
            />
          </div>
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
            {chartPoints.length ? (
              <ExecutiveTrendChart points={chartPoints} />
            ) : (
              <p className="text-sm text-muted-foreground">Chưa có dữ liệu xu hướng.</p>
            )}
          </CardContent>
          <CardFooter>
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
      <DashboardFilters open={filters} onOpenChange={setFilters} search={search} />
      <PreviewDrawer preview={preview} onClose={() => setPreview(undefined)} />
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
      formula: performance?.actualVsFullTarget.formulaVersion ?? "N/A",
      sourceIds: performance?.actualVsFullTarget.numeratorSourceIds ?? [],
      canonicalHref: `/reports/performance/${encodeURIComponent(performance?.period.id ?? search.get("periodId") ?? "current")}?${q}`,
    },
    ros: {
      title: "ROS",
      value: ratio(executive?.ros.valueBps),
      formula: executive?.ros.formulaVersion ?? "N/A",
      sourceIds: executive?.sourceBoundary.sourceIds ?? [],
      canonicalHref: `/reports/executive-metrics/profitability?${q}`,
    },
    runway: {
      title: "Runway",
      value: months(executive?.runwayMonthsThousandths),
      formula: executive?.runwayFormulaVersion ?? "N/A",
      sourceIds: executive?.sourceBoundary.sourceIds ?? [],
      canonicalHref: `/reports/executive-metrics/liquidity?${q}`,
    },
    "equity-consumed": {
      title: "Equity consumed",
      value: ratio(executive?.equityConsumed.valueBps),
      formula: executive?.equityConsumed.formulaVersion ?? "N/A",
      sourceIds: executive?.sourceBoundary.sourceIds ?? [],
      canonicalHref: `/reports/executive-metrics/equity?${q}`,
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
