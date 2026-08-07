"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ExecutiveMetricsContract, ExecutiveRatioContract } from "@naai-erp/contracts";
import { AlertTriangle, ArrowRight, Filter, Info, Search } from "lucide-react";
import {
  FinancialDataTable,
  type FinancialColumn,
} from "@/components/financial/financial-data-table";
import { KpiCard } from "@/components/financial/kpi-card";
import { ModulePage } from "@/components/layout/module-page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QuickDatePresetButtons } from "@/components/ui/quick-date-range-picker";
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
  Popover,
  PopoverActiveAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverFooter,
  PopoverHeader,
  PopoverTitle,
} from "@/components/ui/popover";
import {
  createApiClient,
  DEFAULT_API_CONNECTION,
  loadApiToken,
  loadConnectionSettings,
  type ApiConnectionSettingsV1,
} from "@/lib/api";

export type ExecutiveMetricKind = "equity" | "liquidity" | "profitability" | "returns" | "roi";
type Metric = Readonly<{
  code: string;
  label: string;
  value: string;
  formula: string;
  status: "ready" | "review";
  source: string;
}>;

const pages = [
  {
    kind: "equity",
    title: "Vốn chủ sở hữu",
    description: "Theo dõi accumulated loss và phần vốn góp đã bị tiêu hao.",
    badge: "Equity",
  },
  {
    kind: "liquidity",
    title: "Thanh khoản & runway",
    description: "Unrestricted cash, operating burn và số tháng runway có kiểm soát.",
    badge: "Liquidity",
  },
  {
    kind: "profitability",
    title: "Khả năng sinh lời",
    description: "Margin và ROS trên doanh thu accrual thuần.",
    badge: "Profitability",
  },
  {
    kind: "returns",
    title: "Hiệu quả vốn & tài sản",
    description: "ROE và ROA dùng bình quân số dư đầu kỳ và cuối kỳ.",
    badge: "Returns",
  },
  {
    kind: "roi",
    title: "ROI theo mục đích",
    description: "Tách biệt ROI dự án và marketing, không gộp sai mẫu số.",
    badge: "Purpose-specific",
  },
] as const;

const metrics: Record<ExecutiveMetricKind, readonly Metric[]> = {
  equity: [
    {
      code: "accumulated_loss",
      label: "Lỗ lũy kế",
      value: "420.000.000 ₫",
      formula: "max(0, -retained earnings)",
      status: "ready",
      source: "Bảng cân đối · 421",
    },
    {
      code: "contributed_capital",
      label: "Vốn góp",
      value: "1.000.000.000 ₫",
      formula: "Approved contributed-capital mapping",
      status: "ready",
      source: "Bảng cân đối · 411",
    },
    {
      code: "equity_consumed",
      label: "Equity Consumed",
      value: "42,00%",
      formula: "Accumulated loss / contributed capital",
      status: "review",
      source: "Policy EQ-2026.1",
    },
  ],
  liquidity: [
    {
      code: "unrestricted_cash",
      label: "Tiền khả dụng",
      value: "620.000.000 ₫",
      formula: "Cash less restricted balances",
      status: "ready",
      source: "Ledger cash mapping",
    },
    {
      code: "average_burn",
      label: "Net operating burn bình quân",
      value: "155.000.000 ₫",
      formula: "Reviewed operating cash outflow / 3 months",
      status: "ready",
      source: "Direct cash flow",
    },
    {
      code: "runway",
      label: "Runway",
      value: "4,00 tháng",
      formula: "Unrestricted cash / average burn",
      status: "review",
      source: "Policy LIQ-2026.1",
    },
  ],
  profitability: [
    {
      code: "gross_margin",
      label: "Gross margin",
      value: "58,40%",
      formula: "Gross profit / net accrual revenue",
      status: "ready",
      source: "P&L",
    },
    {
      code: "operating_margin",
      label: "Operating margin",
      value: "18,60%",
      formula: "Operating profit / net accrual revenue",
      status: "ready",
      source: "P&L",
    },
    {
      code: "ros",
      label: "ROS",
      value: "14,20%",
      formula: "Net profit / net accrual revenue",
      status: "ready",
      source: "P&L",
    },
  ],
  returns: [
    {
      code: "roe",
      label: "ROE",
      value: "16,80%",
      formula: "Net profit / average opening-closing equity",
      status: "ready",
      source: "P&L + Balance Sheet",
    },
    {
      code: "roa",
      label: "ROA",
      value: "9,40%",
      formula: "Net profit / average opening-closing assets",
      status: "ready",
      source: "P&L + Balance Sheet",
    },
  ],
  roi: [
    {
      code: "project_roi",
      label: "ROI dự án Web App A",
      value: "36,50%",
      formula: "Project return / reviewed project investment",
      status: "ready",
      source: "ROI definition PROJECT-01",
    },
    {
      code: "marketing_roi",
      label: "ROI chiến dịch Q3",
      value: "22,80%",
      formula: "Incremental marketing return / campaign spend",
      status: "review",
      source: "ROI definition MKT-02",
    },
  ],
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

function money(value: string, currency: string) {
  return `${new Intl.NumberFormat("vi-VN").format(BigInt(value))} ${currency === "VND" ? "₫" : currency}`;
}

function ratioValue(ratio: ExecutiveRatioContract) {
  return ratio.valueBps === null
    ? "N/A"
    : `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(ratio.valueBps / 100)}%`;
}

function thousandths(value: string) {
  const raw = BigInt(value);
  const whole = raw / 1000n;
  const fraction = (raw < 0n ? -raw : raw) % 1000n;
  return fraction === 0n ? whole.toString() : `${whole},${fraction.toString().padStart(3, "0")}`;
}

function cleanFormula(formula: string): string {
  const map: Record<string, string> = {
    "max(0, -retained earnings)": "Lỗ lũy kế tính đến cuối kỳ",
    "Approved contributed-capital mapping": "Vốn góp theo đăng ký kinh doanh & thực góp",
    "accumulated-loss-over-contributed-capital-v1": "Tỷ lệ lỗ lũy kế trên vốn góp",
    "equity-roll-forward-control-v1": "Kiểm soát biến động vốn chủ sở hữu",
    "Liability; excluded from contributed capital": "Nợ phải trả chủ sở hữu (Không tính vào vốn góp)",
    "Approved unrestricted-cash mapping": "Số dư tiền mặt & tiền gửi khả dụng",
    "reviewed-operating-net-burn-v1": "Tốc độ chi tiêu vận hành bình quân",
    "unrestricted-cash-over-reviewed-net-burn-v1": "Thời gian duy trì dòng tiền khả dụng",
    "signed-revenue-profitability-v1": "Tỷ suất lợi nhuận trên doanh thu",
    "executive-metrics-v1": "Mô hình dồn tích quản trị",
  };
  return map[formula] ?? formula;
}

function ratioMetric(code: string, label: string, ratio: ExecutiveRatioContract): Metric {
  return {
    code,
    label,
    value: ratioValue(ratio),
    formula: cleanFormula(ratio.formulaVersion),
    status: ratio.status === "available" ? "ready" : "review",
    source: ratio.reason ?? `${ratio.numeratorMinor} / ${ratio.denominatorMinor}`,
  };
}

function reportMetrics(
  report: ExecutiveMetricsContract,
  kind: ExecutiveMetricKind,
): readonly Metric[] {
  if (kind === "equity")
    return [
      {
        code: "accumulated_loss",
        label: "Lỗ lũy kế",
        value: money(report.accumulatedLossMinor, report.currency),
        formula: cleanFormula("max(0, -retained earnings)"),
        status: "ready",
        source: report.sourceBoundary.ledgerCutoffFingerprint,
      },
      {
        code: "contributed_capital",
        label: "Vốn góp",
        value: money(report.contributedCapitalMinor, report.currency),
        formula: cleanFormula("Approved contributed-capital mapping"),
        status: "ready",
        source: report.sourceBoundary.ledgerCutoffFingerprint,
      },
      ratioMetric("equity_consumed", "Equity Consumed", report.equityConsumed),
      {
        code: "equity_roll_forward",
        label: "Kiểm soát biến động vốn",
        value: money(report.equityRollForward.differenceMinor, report.currency),
        formula: cleanFormula(report.equityRollForward.controlVersion),
        status: report.equityRollForward.status === "tied_out" ? "ready" : "review",
        source: `${report.equityRollForward.openingEquityMinor} → ${report.equityRollForward.actualClosingEquityMinor}`,
      },
      {
        code: "owner_loans",
        label: "Khoản vay chủ sở hữu",
        value: money(report.ownerLoansMinor, report.currency),
        formula: cleanFormula("Liability; excluded from contributed capital"),
        status: "ready",
        source: report.sourceBoundary.ledgerCutoffFingerprint,
      },
    ];
  if (kind === "liquidity")
    return [
      {
        code: "unrestricted_cash",
        label: "Tiền khả dụng",
        value: money(report.unrestrictedCashMinor, report.currency),
        formula: cleanFormula("Approved unrestricted-cash mapping"),
        status: "ready",
        source: report.sourceBoundary.ledgerCutoffFingerprint,
      },
      {
        code: "average_burn",
        label: "Net operating burn bình quân",
        value: report.netBurnMinor === null ? "N/A" : money(report.netBurnMinor, report.currency),
        formula: cleanFormula(report.burnFormulaVersion),
        status: report.netBurnMinor === null ? "review" : "ready",
        source: report.runwayStatus,
      },
      {
        code: "runway",
        label: "Runway",
        value:
          report.runwayMonthsThousandths === null
            ? "N/A"
            : `${thousandths(report.runwayMonthsThousandths)} tháng`,
        formula: cleanFormula(report.runwayFormulaVersion),
        status: report.runwayStatus === "available" ? "ready" : "review",
        source: `Restricted cash excluded: ${report.restrictedCashMinor}`,
      },
    ];
  if (kind === "profitability")
    return [
      ratioMetric("gross_margin", "Gross margin", report.grossMargin),
      ratioMetric("operating_margin", "Operating margin", report.operatingMargin),
      ratioMetric("net_margin", "Net margin", report.netMargin),
      ratioMetric("ros", "ROS", report.ros),
    ];
  if (kind === "returns")
    return [ratioMetric("roe", "ROE", report.roe), ratioMetric("roa", "ROA", report.roa)];
  return report.roi.map((item) => ({
    code: `${item.purpose}_roi:${item.id}`,
    label: item.label,
    value: ratioValue(item.ratio),
    formula: item.formulaVersion,
    status: item.ratio.status === "available" ? "ready" : "review",
    source: `${item.purpose} · ${item.policyVersionId}`,
  }));
}

export function ExecutiveMetricsLanding() {
  return (
    <ModulePage
      title="Chỉ số điều hành"
      description="Một nơi kiểm tra vốn bị tiêu hao, sức khỏe tiền mặt, profitability và ROI; mỗi nhóm có route và source riêng."
    >
      <div className="flex flex-col gap-6">
        <Alert>
          <Info />
          <AlertTitle>Số liệu quản trị dồn tích</AlertTitle>
          <AlertDescription>
            Tự động tổng hợp dữ liệu vốn, thanh khoản, biên lợi nhuận và hiệu quả sử dụng vốn theo kỳ.
          </AlertDescription>
        </Alert>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {pages.map((page) => (
            <Card className="flex flex-col justify-between h-full" key={page.kind}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-lg font-semibold">{page.title}</CardTitle>
                  <Badge variant="outline" className="shrink-0">{page.badge}</Badge>
                </div>
                <CardDescription className="line-clamp-2 mt-1.5">{page.description}</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground pt-0">
                Theo dõi chi tiết số liệu dồn tích & nguồn chứng từ
              </CardContent>
              <CardFooter className="pt-0">
                <Button asChild variant="outline" className="w-full">
                  <Link href={`/reports/executive-metrics/${page.kind}`}>
                    Mở phân tích <ArrowRight data-icon="inline-end" />
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </ModulePage>
  );
}

export function ExecutiveMetricWorkspace({ kind }: Readonly<{ kind: ExecutiveMetricKind }>) {
  const config = pages.find((page) => page.kind === kind)!;
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const client = useClient();
  const [filterOpen, setFilterOpen] = useState(false);
  const [source, setSource] = useState<Metric | null>(null);
  const [report, setReport] = useState<ExecutiveMetricsContract | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [startsOn, setStartsOn] = useState(searchParams.get("startsOn") ?? "2026-01-01");
  const [endsOn, setEndsOn] = useState(searchParams.get("endsOn") ?? "2026-08-31");
  const [serviceLine, setServiceLine] = useState(searchParams.get("serviceLineCode") ?? "");
  const queryKey = searchParams.toString();
  useEffect(() => {
    const query = new URLSearchParams(queryKey);
    const periodEnd = query.get("endsOn") ?? "2026-08-31";
    if (!query.has("startsOn")) query.set("startsOn", "2026-01-01");
    if (!query.has("endsOn")) query.set("endsOn", periodEnd);
    if (!query.has("asOfInstant")) query.set("asOfInstant", `${periodEnd}T16:59:59.999Z`);
    if (!query.has("framework")) query.set("framework", "TT133");
    const controller = new AbortController();
    client
      .data<ExecutiveMetricsContract>(`reports/executive-metrics?${query.toString()}`, {
        signal: controller.signal,
      })
      .then((data) => {
        setReport(data);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setReport(null);
          setLoadError(error instanceof Error ? error.message : "Không tải được chỉ số điều hành");
        }
      });
    return () => controller.abort();
  }, [client, queryKey]);
  const rows = report ? reportMetrics(report, kind) : metrics[kind];
  const columns = useMemo<readonly FinancialColumn<Metric>[]>(
    () => [
      {
        id: "metric",
        header: "Chỉ số",
        cell: (row) => (
          <div className="flex flex-col gap-1">
            <strong>{row.label}</strong>
            <span className="text-xs text-muted-foreground">{row.code}</span>
          </div>
        ),
      },
      {
        id: "value",
        header: "Giá trị exact",
        align: "right",
        cell: (row) => <strong>{row.value}</strong>,
      },
      { id: "formula", header: "Công thức", cell: (row) => row.formula },
      {
        id: "status",
        header: "Trạng thái",
        cell: (row) => (
          <Badge variant={row.status === "ready" ? "secondary" : "outline"}>
            {row.status === "ready" ? "Sẵn sàng" : "Cần review"}
          </Badge>
        ),
      },
      {
        id: "source",
        header: "Nguồn",
        cell: (row) => (
          <Button variant="outline" size="sm" onClick={() => setSource(row)}>
            <Search />
            Xem nguồn
          </Button>
        ),
      },
    ],
    [],
  );
  function applyFilters() {
    const query = new URLSearchParams(searchParams.toString());
    query.set("startsOn", startsOn);
    query.set("endsOn", endsOn);
    if (serviceLine) query.set("serviceLineCode", serviceLine);
    else query.delete("serviceLineCode");
    router.push(`${pathname}?${query.toString()}`);
    setFilterOpen(false);
  }
  return (
    <ModulePage
      title={config.title}
      section="Chỉ số điều hành"
      sectionHref="/reports/executive-metrics"
      description={config.description}
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">
              {startsOn}–{endsOn}
            </Badge>
            <Badge variant="secondary">
              {report?.formulaVersion ? "Số liệu dồn tích chuẩn" : "Đang chờ API"}
            </Badge>
            <Badge variant="outline">{report ? "Dữ liệu hệ thống" : "Dữ liệu phát triển"}</Badge>
            {serviceLine ? <Badge variant="outline">Service line: {serviceLine}</Badge> : null}
          </div>
          <Button variant="outline" onClick={() => setFilterOpen(true)}>
            <Filter />
            Bộ lọc
          </Button>
        </div>
        {loadError ? (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>Chưa tải được dữ liệu hệ thống</AlertTitle>
            <AlertDescription>
              {loadError}. Giao diện đang hiển thị fixture phát triển để kiểm tra luồng tương tác.
            </AlertDescription>
          </Alert>
        ) : null}
        {rows.some((row) => row.status === "review") ? (
          <Alert>
            <AlertTriangle />
            <AlertTitle>Có chỉ số cần review</AlertTitle>
            <AlertDescription>
              Kiểm tra policy, mapping và nguồn trước khi dùng cho quyết định vốn hoặc đầu tư.
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.slice(0, 3).map((row) => (
            <KpiCard
              key={row.code}
              title={row.label}
              period={`${startsOn}–${endsOn}`}
              value={row.value}
              comparison={row.formula}
              footer={
                <Badge variant={row.status === "ready" ? "secondary" : "outline"}>
                  {row.status === "ready" ? "Sẵn sàng" : "Cần review"}
                </Badge>
              }
            />
          ))}
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Bảng chỉ số exact</CardTitle>
            <CardDescription>
              Bảng số liệu là bằng chứng chính; không suy luận giá trị từ biểu đồ.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FinancialDataTable rows={rows} columns={columns} rowKey={(row) => row.code} />
          </CardContent>
        </Card>
      </div>
      <Popover open={filterOpen} onOpenChange={setFilterOpen}>
        <PopoverActiveAnchor open={Boolean(filterOpen)} />
        <PopoverContent
          align="end"
          sideOffset={8}
          className="max-h-[min(80vh,40rem)] w-[min(92vw,30rem)] overflow-y-auto"
        >
          <PopoverHeader>
            <PopoverTitle>Bộ lọc chỉ số điều hành</PopoverTitle>
            <PopoverDescription>
              Filter được lưu vào URL để chia sẻ và tải lại cùng phạm vi.
            </PopoverDescription>
          </PopoverHeader>
          <div className="px-4">
            <FieldGroup>
              <QuickDatePresetButtons
                onSelectRange={(start, end) => {
                  setStartsOn(start);
                  setEndsOn(end);
                }}
              />
              <Field>
                <FieldLabel htmlFor="executive-start">Từ ngày</FieldLabel>
                <Input
                  id="executive-start"
                  type="date"
                  value={startsOn}
                  onChange={(event) => setStartsOn(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="executive-end">Đến ngày</FieldLabel>
                <Input
                  id="executive-end"
                  type="date"
                  value={endsOn}
                  onChange={(event) => setEndsOn(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="executive-service-line">Service line</FieldLabel>
                <Input
                  id="executive-service-line"
                  value={serviceLine}
                  onChange={(event) => setServiceLine(event.target.value)}
                  placeholder="web-app"
                />
              </Field>
            </FieldGroup>
          </div>
          <PopoverFooter>
            <Button onClick={applyFilters}>Áp dụng</Button>
          </PopoverFooter>
        </PopoverContent>
      </Popover>
      <Dialog
        open={Boolean(source)}
        onOpenChange={(open) => {
          if (!open) setSource(null);
        }}
      >
        <DialogContent className="max-h-[min(90vh,48rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nguồn chỉ số {source?.label}</DialogTitle>
            <DialogDescription>
              Trace công thức và source set dùng để tính giá trị exact.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 text-sm">
            <div>
              <strong>Source</strong>
              <p className="text-muted-foreground">{source?.source}</p>
            </div>
            <div>
              <strong>Formula</strong>
              <p className="text-muted-foreground">{source?.formula}</p>
            </div>
            <div>
              <strong>Cutoff</strong>
              <p className="text-muted-foreground">
                2026-08-31T16:59:59.999Z · fingerprint demo-erp640
              </p>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Đóng</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ModulePage>
  );
}
