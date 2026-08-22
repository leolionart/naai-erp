"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type {
  PerformanceComparisonLineContract,
  PerformanceResultStatusContract,
} from "@naai-erp/contracts";
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
  performanceComparisonApi,
  type PerformanceComparison,
  useAuthenticatedApiClient,
} from "@/lib/api";

type ComparisonRow = Readonly<{
  key: "monthOverMonth" | "yearOverYear" | "actualVsRetainedForecast" | "forecastVsFullTarget";
  label: string;
  line: PerformanceComparisonLineContract;
}>;
type SourceSelection = Readonly<{ label: string; line: PerformanceComparisonLineContract }>;

const currentPeriodId = () => `CAL-${new Date().toISOString().slice(0, 7)}`;
const basisLabels = {
  recognized: "Doanh thu ghi nhận",
  invoiced: "Doanh thu đã xuất hóa đơn",
  collected: "Tiền đã thu",
} as const;
const reasonLabels: Readonly<Record<string, string>> = {
  "numerator_missing:actual_missing": "Chưa có actual cho kỳ và actual basis đã chọn",
  "denominator_missing:published_target_missing":
    "Chưa có target đã publish cho kỳ và actual basis đã chọn",
  "denominator_missing:published_forecast_snapshot_missing":
    "Chưa có forecast snapshot đã publish cho kỳ này",
  "denominator_missing:previous_period_missing": "Chưa có dữ liệu kỳ trước tương ứng",
  "denominator_missing:prior_year_missing": "Chưa có dữ liệu cùng kỳ năm trước",
  comparison_denominator_zero: "Mẫu số bằng 0 nên phần trăm không có ý nghĩa",
};

function formatBps(value: number | null) {
  return value === null
    ? "N/A"
    : `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value / 100)}%`;
}

function unavailableReason(line: PerformanceComparisonLineContract) {
  return line.reason ? (reasonLabels[line.reason] ?? line.reason) : "Không đủ cơ sở so sánh";
}

function queryFrom(searchParams: URLSearchParams, periodId?: string) {
  const query = new URLSearchParams();
  const activePeriod = periodId ?? searchParams.get("periodId") ?? currentPeriodId();
  const todayStr = new Date().toISOString().substring(0, 10);
  query.set("periodId", activePeriod);
  query.set(
    "periodBasis",
    searchParams.get("periodBasis") ?? (activePeriod.startsWith("FY") ? "fiscal" : "calendar"),
  );
  query.set(
    "actualBasis",
    searchParams.get("actualBasis") ?? searchParams.get("basis") ?? "recognized",
  );
  query.set(
    "asOfInstant",
    searchParams.get("asOfInstant") ?? searchParams.get("asOf") ?? `${todayStr}T16:59:59.999Z`,
  );
  for (const key of ["forecastVersionId", "teamId", "serviceLineCode", "ownerId"]) {
    const value = searchParams.get(key);
    if (value) query.set(key, value);
  }
  return query;
}

function comparisonRows(report: PerformanceComparison): readonly ComparisonRow[] {
  return [
    { key: "monthOverMonth", label: "Month over month", line: report.monthOverMonth },
    { key: "yearOverYear", label: "Year over year", line: report.yearOverYear },
    {
      key: "actualVsRetainedForecast",
      label: "Actual vs retained forecast",
      line: report.actualVsRetainedForecast,
    },
    {
      key: "forecastVsFullTarget",
      label: "Forecast vs full target",
      line: report.forecastVsFullTarget,
    },
  ];
}

function ResultStatus({ status }: Readonly<{ status: PerformanceResultStatusContract }>) {
  return <StatusBadge status={status === "available" ? "verified" : "needs_review"} />;
}

function SourceDialog({
  selection,
  onOpenChange,
}: Readonly<{ selection?: SourceSelection; onOpenChange: (open: boolean) => void }>) {
  return (
    <Dialog
      open={Boolean(selection)}
      onOpenChange={(open) => {
        if (!open) onOpenChange(false);
      }}
    >
      <DialogContent className="flex max-h-[min(90vh,48rem)] flex-col sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Nguồn · {selection?.label}</DialogTitle>
          <DialogDescription>
            Source IDs và formula metadata từ cùng read model của báo cáo.
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pr-1">
          {selection ? (
            <>
              <div className="rounded-lg border p-3 text-sm">
                <p className="font-medium">Công thức</p>
                <p className="mt-1 text-muted-foreground">{selection.line.basis}</p>
                <p className="text-muted-foreground">{selection.line.formulaVersion}</p>
              </div>
              <SourceList
                title="Nguồn actual / numerator"
                ids={selection.line.numeratorSourceIds}
              />
              <SourceList
                title="Nguồn comparison / denominator"
                ids={selection.line.denominatorSourceIds}
              />
              {selection.line.status !== "available" ? (
                <Alert>
                  <AlertTitle>Kết quả N/A</AlertTitle>
                  <AlertDescription>{unavailableReason(selection.line)}</AlertDescription>
                </Alert>
              ) : null}
            </>
          ) : null}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Đóng</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SourceList({ title, ids }: Readonly<{ title: string; ids: readonly string[] }>) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{title}</h3>
      {ids.length ? (
        <div className="flex flex-wrap gap-2">
          {ids.map((id) => (
            <Badge key={id} variant="outline" className="max-w-full break-all">
              {id}
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Không có source ID.</p>
      )}
    </section>
  );
}

function FilterSheet({
  open,
  onOpenChange,
  query,
  onApply,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  query: URLSearchParams;
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
            <PopoverTitle>Bộ lọc hiệu suất</PopoverTitle>
            <PopoverDescription>
              Chọn period, actual basis và dimensions. Các lựa chọn được lưu trên URL.
            </PopoverDescription>
          </PopoverHeader>
          <FieldGroup className="px-4">
            <Field>
              <FieldLabel htmlFor="performance-period">Kỳ so sánh</FieldLabel>
              <Input
                id="performance-period"
                name="periodId"
                defaultValue={query.get("periodId") ?? currentPeriodId()}
                placeholder="CAL-2024-02 hoặc FY2024-P02"
                required
              />
            </Field>
            <SelectField
              name="periodBasis"
              label="Period definition"
              value={query.get("periodBasis") ?? "calendar"}
              options={[
                ["calendar", "Calendar month"],
                ["fiscal", "Fiscal period"],
              ]}
            />
            <SelectField
              name="actualBasis"
              label="Actual basis"
              value={query.get("actualBasis") ?? "recognized"}
              options={[
                ["recognized", "Recognized"],
                ["invoiced", "Invoiced"],
                ["collected", "Collected"],
              ]}
            />
            <Field>
              <FieldLabel htmlFor="performance-cutoff">As-of instant</FieldLabel>
              <Input
                id="performance-cutoff"
                name="asOfInstant"
                defaultValue={query.get("asOfInstant") ?? ""}
                placeholder="2024-02-15T16:59:59Z"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="performance-forecast">Kịch bản dự báo</FieldLabel>
              <Input
                id="performance-forecast"
                name="forecastVersionId"
                defaultValue={query.get("forecastVersionId") ?? ""}
              />
            </Field>
            {[
              ["teamId", "Nhóm"],
              ["serviceLineCode", "Dòng dịch vụ"],
              ["ownerId", "Người phụ trách"],
            ].map(([name, label]) => (
              <Field key={name}>
                <FieldLabel htmlFor={`performance-${name}`}>{label}</FieldLabel>
                <Input
                  id={`performance-${name}`}
                  name={name}
                  defaultValue={query.get(name) ?? ""}
                />
              </Field>
            ))}
          </FieldGroup>
          <PopoverFooter className="sticky bottom-0 bg-popover py-2">
            <Button type="submit">Áp dụng</Button>
          </PopoverFooter>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function SelectField({
  name,
  label,
  value,
  options,
}: Readonly<{
  name: string;
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
}>) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select name={name} defaultValue={value}>
        <SelectTrigger aria-label={label} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map(([option, text]) => (
              <SelectItem key={option} value={option}>
                {text}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

function usePerformanceReport(fixedPeriodId?: string) {
  const { client, hydrated, hasToken } = useAuthenticatedApiClient();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const query = useMemo(
    () => queryFrom(new URLSearchParams(searchKey), fixedPeriodId),
    [fixedPeriodId, searchKey],
  );
  const [report, setReport] = useState<PerformanceComparison>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const load = useCallback(async () => {
    if (!hydrated) return;
    setLoading(true);
    setError(undefined);
    if (!hasToken) {
      setReport(undefined);
      setError("AUTH_REQUIRED");
      setLoading(false);
      return;
    }
    try {
      setReport(
        await client.data<PerformanceComparison>(
          `${performanceComparisonApi.report}?${query.toString()}`,
        ),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể tải performance report");
    } finally {
      setLoading(false);
    }
  }, [client, hasToken, hydrated, query]);
  useEffect(() => void load(), [load]);
  return { report, loading, error, query };
}

function Kpis({ report, loading }: Readonly<{ report?: PerformanceComparison; loading: boolean }>) {
  const actual = report?.actualVsProratedTarget.numeratorMinor;
  const prorated = report?.proratedTargetMinor;
  const full = report?.actualVsFullTarget.denominatorMinor;
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <KpiCard
        title="Actual MTD"
        period={report ? basisLabels[report.actualBasis] : "Actual basis đang chọn"}
        value={actual === null || actual === undefined ? "N/A" : <MoneyCell minor={actual} />}
        loading={loading}
      />
      <KpiCard
        title="Prorated target"
        period={report ? `${report.elapsedDays}/${report.periodDays} ngày trong kỳ` : "MTD target"}
        value={prorated === null || prorated === undefined ? "N/A" : <MoneyCell minor={prorated} />}
        comparison={report ? formatBps(report.actualVsProratedTarget.ratioBps) : undefined}
        loading={loading}
      />
      <KpiCard
        title="Full target"
        period={report ? `${report.period.startsOn} → ${report.period.endsOn}` : "Target cả kỳ"}
        value={full === null || full === undefined ? "N/A" : <MoneyCell minor={full} />}
        comparison={report ? formatBps(report.actualVsFullTarget.ratioBps) : undefined}
        loading={loading}
      />
    </div>
  );
}

function ComparisonTable({
  report,
  loading,
  onSources,
}: Readonly<{
  report?: PerformanceComparison;
  loading: boolean;
  onSources?: (selection: SourceSelection) => void;
}>) {
  const rows = report ? comparisonRows(report) : [];
  const columns: readonly FinancialColumn<ComparisonRow>[] = [
    {
      id: "comparison",
      header: "So sánh",
      cell: (row) => (
        <div className="min-w-44">
          <p className="font-medium">{row.label}</p>
          <p className="text-xs text-muted-foreground">{row.line.basis}</p>
        </div>
      ),
    },
    {
      id: "actual",
      header: "Actual / forecast",
      align: "right",
      cell: (row) =>
        row.line.numeratorMinor === null ? "N/A" : <MoneyCell minor={row.line.numeratorMinor} />,
    },
    {
      id: "comparisonValue",
      header: "Comparator",
      align: "right",
      cell: (row) =>
        row.line.denominatorMinor === null ? (
          <span title={unavailableReason(row.line)}>N/A</span>
        ) : (
          <MoneyCell minor={row.line.denominatorMinor} />
        ),
    },
    {
      id: "variance",
      header: "Variance",
      align: "right",
      cell: (row) => (
        <div>
          {row.line.varianceMinor === null ? "N/A" : <MoneyCell minor={row.line.varianceMinor} />}
          <p className="text-xs text-muted-foreground">{formatBps(row.line.varianceBps)}</p>
        </div>
      ),
    },
    {
      id: "status",
      header: "Trạng thái",
      cell: (row) => (
        <div className="flex min-w-44 flex-col gap-1">
          <ResultStatus status={row.line.status} />
          {row.line.status !== "available" ? (
            <p className="text-xs text-muted-foreground">{unavailableReason(row.line)}</p>
          ) : null}
        </div>
      ),
    },
    {
      id: "sources",
      header: "Nguồn",
      cell: (row) =>
        onSources ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onSources({ label: row.label, line: row.line })}
          >
            Xem nguồn
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">
            {row.line.numeratorSourceIds.length + row.line.denominatorSourceIds.length} nguồn
          </span>
        ),
    },
  ];
  return (
    <FinancialDataTable
      rows={rows}
      columns={columns}
      rowKey={(row) => row.key}
      loading={loading}
      emptyTitle="Chưa có dữ liệu so sánh"
    />
  );
}

export function PerformanceComparisonQueueWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { report, loading, error, query } = usePerformanceReport();
  function applyFilters(data: FormData) {
    const next = new URLSearchParams();
    for (const [key, value] of data.entries())
      if (String(value).trim()) next.set(key, String(value));
    router.replace(`${pathname}?${next}`);
    setFiltersOpen(false);
  }
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">
            {report?.period.label ?? query.get("periodId")} ·{" "}
            {report ? basisLabels[report.actualBasis] : query.get("actualBasis")}
          </p>
          <p className="text-xs text-muted-foreground">
            Cutoff {report?.asOfLocalDate ?? query.get("asOfInstant") ?? "cuối kỳ"} ·
            Asia/Ho_Chi_Minh
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setFiltersOpen(true)}>
            Bộ lọc
          </Button>
          <Button asChild>
            <Link
              href={`/reports/performance/${encodeURIComponent(query.get("periodId") ?? currentPeriodId())}?${query}`}
            >
              Xem chi tiết kỳ
            </Link>
          </Button>
        </div>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Không thể tải performance report</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Kpis report={report} loading={loading} />
      <Card>
        <CardHeader>
          <CardTitle>So sánh hiệu suất</CardTitle>
          <CardDescription>MoM, YoY và forecast variance dùng cùng read model.</CardDescription>
        </CardHeader>
        <CardContent>
          <ComparisonTable report={report} loading={loading} />
        </CardContent>
      </Card>
      <FilterSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        query={query}
        onApply={applyFilters}
      />
    </div>
  );
}

export function PerformanceComparisonDetailWorkspace({ periodId }: Readonly<{ periodId: string }>) {
  const router = useRouter();
  const pathname = usePathname();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selection, setSelection] = useState<SourceSelection>();
  const { report, loading, error, query } = usePerformanceReport(periodId);
  function applyFilters(data: FormData) {
    const next = new URLSearchParams();
    for (const [key, value] of data.entries()) {
      if (key !== "periodId" && String(value).trim()) next.set(key, String(value));
    }
    router.replace(`${pathname}?${next}`);
    setFiltersOpen(false);
  }
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="outline">
          <Link href={`/reports/performance?${query}`}>Quay lại tổng quan</Link>
        </Button>
        <Button variant="outline" onClick={() => setFiltersOpen(true)}>
          Bộ lọc kỳ
        </Button>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Không thể tải chi tiết kỳ</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {report ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle>{report.period.label}</CardTitle>
                <CardDescription>
                  {report.period.startsOn} → {report.period.endsOn} · cutoff {report.asOfLocalDate}
                </CardDescription>
              </div>
              <Badge variant="outline">{basisLabels[report.actualBasis]}</Badge>
            </div>
          </CardHeader>
        </Card>
      ) : null}
      <Kpis report={report} loading={loading} />
      <Card>
        <CardHeader>
          <CardTitle>Chi tiết công thức và nguồn</CardTitle>
          <CardDescription>
            Mở dialog để xem source IDs. Kết quả thiếu dữ liệu hoặc mẫu số 0 hiển thị N/A cùng
            nguyên nhân.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ComparisonTable report={report} loading={loading} onSources={setSelection} />
        </CardContent>
      </Card>
      {report?.confidenceFlags.length ? (
        <Alert>
          <AlertTitle>Confidence flags</AlertTitle>
          <AlertDescription className="mt-2 flex flex-wrap gap-2">
            {report.confidenceFlags.map((flag) => (
              <Badge key={`${flag.code}:${flag.reason}`} variant="outline">
                {flag.reason}
              </Badge>
            ))}
          </AlertDescription>
        </Alert>
      ) : null}
      <FilterSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        query={query}
        onApply={applyFilters}
      />
      <SourceDialog selection={selection} onOpenChange={() => setSelection(undefined)} />
    </div>
  );
}
