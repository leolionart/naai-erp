"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CircleAlertIcon } from "lucide-react";
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
  createApiClient,
  DEFAULT_API_CONNECTION,
  loadApiToken,
  loadConnectionSettings,
  projectProfitabilityApi,
  type ApiConnectionSettingsV1,
  type ProfitabilityBreakdownRow,
  type ProfitabilityConfidenceFlag,
  type ProjectProfitabilityDetail,
  type ProjectProfitabilityReport,
  type ProjectProfitabilitySummary,
} from "@/lib/api";
import { formatExactInteger } from "@/lib/format";

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 7)}-01`;
const percentage = (bps: number | null) =>
  bps === null
    ? "Không có cơ sở"
    : `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(bps / 100)}%`;
const ratioBps = (numerator: string, denominator: string): number | null => {
  const basis = BigInt(denominator);
  if (basis === 0n) return null;
  const value = BigInt(numerator) * 10_000n;
  const negative = value < 0n !== basis < 0n;
  const absoluteValue = value < 0n ? -value : value;
  const absoluteBasis = basis < 0n ? -basis : basis;
  const rounded = (absoluteValue + absoluteBasis / 2n) / absoluteBasis;
  return Number(negative ? -rounded : rounded);
};
const flagLabels: Readonly<Record<ProfitabilityConfidenceFlag, string>> = {
  unbilled_work: "Doanh thu chưa xuất hóa đơn",
  overdue_ar: "Công nợ quá hạn",
  budget_overrun: "Vượt ngân sách",
  missing_dimensions: "Thiếu dimensions",
};

function useClient() {
  const [connection, setConnection] = useState<ApiConnectionSettingsV1>(DEFAULT_API_CONNECTION);
  const [token, setToken] = useState("");
  useEffect(() => {
    setConnection(loadConnectionSettings(localStorage));
    setToken(loadApiToken(sessionStorage));
  }, []);
  return useMemo(
    () => createApiClient({ connection: () => connection, token: () => token }),
    [connection, token],
  );
}

function queryFrom(searchParams: URLSearchParams) {
  const query = new URLSearchParams();
  for (const key of [
    "asOf",
    "periodStart",
    "periodEnd",
    "clientId",
    "serviceLineId",
    "accountOwnerId",
    "confidenceFlag",
  ]) {
    const value = searchParams.get(key);
    if (value) query.set(key, value);
  }
  return query;
}

function ConfidenceBadges({ flags }: Readonly<{ flags: readonly ProfitabilityConfidenceFlag[] }>) {
  if (!flags.length) return <StatusBadge status="verified" />;
  return (
    <div className="flex max-w-64 flex-wrap gap-1">
      {flags.map((flag) => (
        <Badge variant="outline" key={flag}>
          {flagLabels[flag]}
        </Badge>
      ))}
    </div>
  );
}

export function ProjectProfitabilityQueueWorkspace() {
  const client = useClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [report, setReport] = useState<ProjectProfitabilityReport>();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const query = useMemo(() => {
    const next = queryFrom(new URLSearchParams(searchParams.toString()));
    if (!next.has("asOf")) next.set("asOf", today());
    if (!next.has("periodStart")) next.set("periodStart", monthStart());
    if (!next.has("periodEnd")) next.set("periodEnd", today());
    return next;
  }, [searchParams]);
  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      setReport(
        await client.data<ProjectProfitabilityReport>(`${projectProfitabilityApi.report}?${query}`),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể tải profitability report");
    } finally {
      setLoading(false);
    }
  }, [client, query]);
  useEffect(() => void load(), [load]);

  const columns: readonly FinancialColumn<ProjectProfitabilitySummary>[] = [
    {
      id: "project",
      header: "Dự án",
      cell: (row) => (
        <div className="flex min-w-52 flex-col gap-0.5">
          <Link
            className="font-medium underline"
            href={`/reports/project-profitability/projects/${encodeURIComponent(row.projectId)}?${query}`}
          >
            {row.projectCode} · {row.projectName}
          </Link>
          <span className="text-xs text-muted-foreground">
            {[row.clientName, row.serviceLineName, row.accountOwnerName]
              .filter(Boolean)
              .join(" · ") || "Chưa gán phân loại"}
          </span>
        </div>
      ),
    },
    {
      id: "revenue",
      header: "Doanh thu ghi nhận",
      align: "right",
      cell: (row) => <MoneyCell minor={row.recognizedRevenueMinor} />,
    },
    {
      id: "gross",
      header: "Gross margin",
      align: "right",
      cell: (row) => (
        <div>
          <MoneyCell minor={row.grossMarginMinor} />
          <span className="text-xs text-muted-foreground">{percentage(row.grossMarginBps)}</span>
        </div>
      ),
    },
    {
      id: "contribution",
      header: "Contribution",
      align: "right",
      cell: (row) => (
        <div>
          <MoneyCell minor={row.contributionMarginMinor} />
          <span className="text-xs text-muted-foreground">
            {percentage(row.contributionMarginBps)}
          </span>
        </div>
      ),
    },
    {
      id: "loaded",
      header: "Fully loaded",
      align: "right",
      cell: (row) => (
        <div>
          <MoneyCell minor={row.fullyLoadedProfitMinor} />
          <span className="text-xs text-muted-foreground">
            {percentage(row.fullyLoadedMarginBps)}
          </span>
        </div>
      ),
    },
    {
      id: "confidence",
      header: "Độ tin cậy",
      cell: (row) => <ConfidenceBadges flags={row.confidenceCodes} />,
    },
  ];

  function applyFilters(formData: FormData) {
    const next = new URLSearchParams();
    for (const key of [
      "asOf",
      "periodStart",
      "periodEnd",
      "clientId",
      "serviceLineId",
      "accountOwnerId",
      "confidenceFlag",
    ]) {
      const value = String(formData.get(key) ?? "").trim();
      if (value && value !== "all") next.set(key, value);
    }
    router.replace(`${pathname}?${next}`);
    setFiltersOpen(false);
  }

  const totals = report?.totals;
  const totalGrossBps = totals
    ? ratioBps(totals.grossMarginMinor, totals.recognizedRevenueMinor)
    : null;
  const totalContributionBps = totals
    ? ratioBps(totals.contributionMarginMinor, totals.recognizedRevenueMinor)
    : null;
  const totalFullyLoadedBps = totals
    ? ratioBps(totals.fullyLoadedProfitMinor, totals.recognizedRevenueMinor)
    : null;
  const flaggedCount = report?.items.filter((item) => item.confidenceCodes.length).length ?? 0;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {report
            ? `${report.periodStart} → ${report.periodEnd} · as of ${report.asOf}`
            : "Đang tải kỳ báo cáo"}
        </p>
        <Button variant="outline" onClick={() => setFiltersOpen(true)}>
          Bộ lọc báo cáo
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Doanh thu ghi nhận"
          period="Không dùng tiền đã thu thay doanh thu"
          value={totals ? <MoneyCell minor={totals.recognizedRevenueMinor} /> : "—"}
          loading={loading}
        />
        <KpiCard
          title="Gross margin"
          period="Sau direct project cost"
          value={totals ? <MoneyCell minor={totals.grossMarginMinor} /> : "—"}
          comparison={totals ? percentage(totalGrossBps) : undefined}
          loading={loading}
        />
        <KpiCard
          title="Contribution margin"
          period="Sau variable overhead"
          value={totals ? <MoneyCell minor={totals.contributionMarginMinor} /> : "—"}
          comparison={totals ? percentage(totalContributionBps) : undefined}
          loading={loading}
        />
        <KpiCard
          title="Fully loaded profit"
          period="Sau fixed overhead"
          value={totals ? <MoneyCell minor={totals.fullyLoadedProfitMinor} /> : "—"}
          comparison={totals ? percentage(totalFullyLoadedBps) : undefined}
          loading={loading}
        />
      </div>

      {flaggedCount ? (
        <Alert>
          <CircleAlertIcon />
          <AlertTitle>{flaggedCount} dự án cần kiểm tra độ tin cậy</AlertTitle>
          <AlertDescription>
            Mở drill-down để xem unbilled work, overdue AR, overrun hoặc dimensions còn thiếu.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Profitability theo dự án</CardTitle>
          <CardDescription>
            Queue so sánh margin; mỗi dự án có dedicated drill-down về revenue, direct cost và
            overhead.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FinancialDataTable
            rows={report?.items ?? []}
            columns={columns}
            rowKey={(row) => row.projectId}
            loading={loading}
            error={error}
            emptyTitle="Chưa có dự án trong kỳ"
            emptyDescription="Đổi kỳ báo cáo hoặc kiểm tra dữ liệu revenue/cost đã post."
          />
        </CardContent>
      </Card>

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent>
          <form action={applyFilters} className="flex h-full flex-col">
            <SheetHeader>
              <SheetTitle>Bộ lọc profitability</SheetTitle>
              <SheetDescription>
                Kỳ và dimensions được lưu trên URL để chia sẻ đúng ngữ cảnh.
              </SheetDescription>
            </SheetHeader>
            <FieldGroup className="min-h-0 flex-1 overflow-y-auto py-4 pr-1">
              <Field>
                <FieldLabel htmlFor="prf-start">Từ ngày</FieldLabel>
                <Input
                  id="prf-start"
                  name="periodStart"
                  type="date"
                  defaultValue={query.get("periodStart") ?? ""}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="prf-end">Đến ngày</FieldLabel>
                <Input
                  id="prf-end"
                  name="periodEnd"
                  type="date"
                  defaultValue={query.get("periodEnd") ?? ""}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="prf-as-of">As of</FieldLabel>
                <Input
                  id="prf-as-of"
                  name="asOf"
                  type="date"
                  defaultValue={query.get("asOf") ?? ""}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="prf-client">Client ID</FieldLabel>
                <Input id="prf-client" name="clientId" defaultValue={query.get("clientId") ?? ""} />
              </Field>
              <Field>
                <FieldLabel htmlFor="prf-service">Service line ID</FieldLabel>
                <Input
                  id="prf-service"
                  name="serviceLineId"
                  defaultValue={query.get("serviceLineId") ?? ""}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="prf-owner">Account owner ID</FieldLabel>
                <Input
                  id="prf-owner"
                  name="accountOwnerId"
                  defaultValue={query.get("accountOwnerId") ?? ""}
                />
              </Field>
              <Field>
                <FieldLabel>Confidence flag</FieldLabel>
                <Select name="confidenceFlag" defaultValue={query.get("confidenceFlag") ?? "all"}>
                  <SelectTrigger aria-label="Confidence flag">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="all">Tất cả</SelectItem>
                      {Object.entries(flagLabels).map(([value, label]) => (
                        <SelectItem value={value} key={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>
            <SheetFooter>
              <Button type="button" variant="outline" onClick={() => router.replace(pathname)}>
                Xóa bộ lọc
              </Button>
              <Button type="submit">Áp dụng</Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function BreakdownTable({
  title,
  description,
  rows,
}: Readonly<{ title: string; description: string; rows: readonly ProfitabilityBreakdownRow[] }>) {
  const columns: readonly FinancialColumn<ProfitabilityBreakdownRow>[] = [
    {
      id: "line",
      header: "Khoản mục",
      cell: (row) => (
        <div className="flex min-w-48 flex-col">
          <span className="font-medium">{row.label}</span>
          <span className="text-xs text-muted-foreground">
            {[row.kind, row.costClass, row.sourceType].filter(Boolean).join(" · ")}
          </span>
        </div>
      ),
    },
    {
      id: "hours",
      header: "Giờ",
      align: "right",
      cell: (row) => (row.hours ? formatExactInteger(row.hours) : "—"),
    },
    {
      id: "amount",
      header: "Giá trị",
      align: "right",
      cell: (row) => <MoneyCell minor={row.amountMinor} />,
    },
    {
      id: "source",
      header: "Nguồn / version",
      cell: (row) => {
        const source = row.journalId ?? row.runId ?? row.costRateVersionId ?? row.sourceId;
        return source ? <span className="font-mono text-xs">{source}</span> : "—";
      },
    },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <FinancialDataTable rows={rows} columns={columns} rowKey={(row) => row.id} />
      </CardContent>
    </Card>
  );
}

export function ProjectProfitabilityDetailWorkspace({
  projectId,
}: Readonly<{ projectId: string }>) {
  const client = useClient();
  const searchParams = useSearchParams();
  const [detail, setDetail] = useState<ProjectProfitabilityDetail>();
  const [error, setError] = useState<string>();
  const query = useMemo(
    () => queryFrom(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );
  const load = useCallback(async () => {
    setError(undefined);
    try {
      setDetail(
        await client.data<ProjectProfitabilityDetail>(
          `${projectProfitabilityApi.project(projectId)}?${query}`,
        ),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể tải profitability drill-down");
    }
  }, [client, projectId, query]);
  useEffect(() => void load(), [load]);
  if (error)
    return (
      <Alert variant="destructive">
        <AlertTitle>Không thể tải dự án</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  if (!detail)
    return <div className="text-sm text-muted-foreground">Đang tải profitability drill-down…</div>;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">
            {detail.projectCode} · {detail.projectName}
          </h2>
          <p className="text-sm text-muted-foreground">
            {detail.periodStart} → {detail.periodEnd} · as of {detail.asOf}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href={`/reports/project-profitability?${query}`}>Quay lại report</Link>
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Gross margin"
          period="Revenue − direct cost"
          value={<MoneyCell minor={detail.grossMarginMinor} />}
          comparison={percentage(detail.grossMarginBps)}
        />
        <KpiCard
          title="Contribution margin"
          period="Gross − variable overhead"
          value={<MoneyCell minor={detail.contributionMarginMinor} />}
          comparison={percentage(detail.contributionMarginBps)}
        />
        <KpiCard
          title="Fully loaded profit"
          period="Contribution − fixed overhead"
          value={<MoneyCell minor={detail.fullyLoadedProfitMinor} />}
          comparison={percentage(detail.fullyLoadedMarginBps)}
        />
        <KpiCard
          title="Realized hourly rate"
          period={`${formatExactInteger(detail.billableHours)} billable hours · ${percentage(detail.utilizationBps)} utilization`}
          value={
            detail.realizedHourlyRateMinor === null ? (
              "—"
            ) : (
              <MoneyCell minor={detail.realizedHourlyRateMinor} />
            )
          }
        />
      </div>
      {detail.confidenceDetails.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {detail.confidenceDetails.map((flag) => (
            <Alert
              variant={flag.severity === "critical" ? "destructive" : "default"}
              key={flag.code}
            >
              <CircleAlertIcon />
              <AlertTitle>{flag.title}</AlertTitle>
              <AlertDescription>{flag.description}</AlertDescription>
            </Alert>
          ))}
        </div>
      ) : (
        <Alert>
          <AlertTitle>Dữ liệu đã qua kiểm soát</AlertTitle>
          <AlertDescription>Không có confidence flag tại thời điểm báo cáo.</AlertDescription>
        </Alert>
      )}
      <BreakdownTable
        title="Doanh thu ghi nhận"
        description="Milestone và recognition sources; invoiced/collected chỉ là axes đối chiếu."
        rows={detail.revenueBreakdown.map((row, index) => ({
          id: `revenue-${row.kind}-${index}`,
          label:
            row.kind === "recognized"
              ? "Doanh thu ghi nhận"
              : row.kind === "invoiced"
                ? "Đã xuất hóa đơn"
                : "Đã thu tiền",
          kind: row.kind,
          amountMinor: row.amountMinor,
          sourceId: row.sourceIds.join(", "),
        }))}
      />
      <BreakdownTable
        title="Direct project cost"
        description="Labor theo rate version và freelancer/vendor/tool được gán trực tiếp."
        rows={detail.directCostBreakdown.map((row, index) => ({
          id: `direct-${row.kind}-${index}`,
          label:
            row.kind === "labor"
              ? "Chi phí nhân sự"
              : row.kind === "source_linked"
                ? "Chi phí nguồn gán trực tiếp"
                : row.kind === "allocated"
                  ? "Chi phí được phân bổ"
                  : "Điều chỉnh chi phí",
          kind: row.kind,
          amountMinor: row.amountMinor,
          sourceId: row.sourceIds.join(", "),
        }))}
      />
      <BreakdownTable
        title="Overhead allocation"
        description="Variable và fixed overhead giữ source pool, policy, run và journal drill-down."
        rows={detail.overheadBreakdown.map((row, index) => ({
          id: `overhead-${row.costClass}-${index}`,
          label: row.costClass === "variable" ? "Variable overhead" : "Fixed overhead",
          kind: "overhead",
          costClass: row.costClass,
          amountMinor: row.amountMinor,
          sourcePoolId: row.sourcePoolIds.join(", "),
          policyId: row.policyIds.join(", "),
          runId: row.runIds.join(", "),
          journalId: row.journalIds.join(", "),
        }))}
      />
      <Card>
        <CardHeader>
          <CardTitle>Control tie</CardTitle>
          <CardDescription>
            Project report phải tie về ledger/read-model dimensions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FinancialDataTable
            rows={[
              { id: "revenue", label: "Recognized revenue", ...detail.glTie.recognizedRevenue },
              { id: "direct", label: "Direct project cost", ...detail.glTie.directProjectCost },
              { id: "overhead", label: "Allocated overhead", ...detail.glTie.allocatedOverhead },
            ]}
            columns={[
              { id: "control", header: "Control", cell: (row) => row.label },
              {
                id: "source",
                header: "Report",
                align: "right",
                cell: (row) => <MoneyCell minor={row.sourceMinor} />,
              },
              {
                id: "ledger",
                header: "Ledger",
                align: "right",
                cell: (row) => <MoneyCell minor={row.ledgerMinor} />,
              },
              {
                id: "difference",
                header: "Difference",
                align: "right",
                cell: (row) => <MoneyCell minor={row.differenceMinor} />,
              },
              {
                id: "status",
                header: "Status",
                cell: (row) => (
                  <StatusBadge status={row.status === "tied_out" ? "reconciled" : "needs_review"} />
                ),
              },
            ]}
            rowKey={(row) => row.id}
          />
        </CardContent>
      </Card>
    </div>
  );
}
