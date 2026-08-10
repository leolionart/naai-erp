"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, ListFilter, RefreshCw } from "lucide-react";
import { PeriodRangeNavigator } from "@/components/layout/period-range-navigator";
import { KpiCard } from "@/components/financial/kpi-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  expenseBreakdownReportApi,
  type ExpenseBreakdownCurrencySeries,
  type ExpenseBreakdownGroup,
  type ExpenseBreakdownKind,
  type ExpenseBreakdownReport,
  useAuthenticatedApiClient,
} from "@/lib/api";

const today = () => new Date().toISOString().slice(0, 10);
const yearStart = () => `${today().slice(0, 4)}-01-01`;

export function expenseBreakdownQuery(search: URLSearchParams) {
  return new URLSearchParams({
    startsOn: search.get("startsOn") ?? yearStart(),
    endsOn: search.get("endsOn") ?? today(),
  });
}

export function expenseDrillDownHref(
  kind: ExpenseBreakdownKind,
  group: ExpenseBreakdownGroup,
  month: string,
) {
  const query = new URLSearchParams({
    startsOn: `${month}-01`,
    endsOn: monthEnd(month),
  });
  const supplied = group.drillDown ?? {};
  for (const [key, value] of Object.entries(supplied)) if (value) query.set(key, value);
  if (Object.keys(supplied).length === 0 && group.key !== null) {
    query.set(kind === "payee" ? "payeePartyId" : "categoryId", group.key);
  }
  if (group.key === null) {
    query.set(kind === "payee" ? "payeePartyId" : "categoryId", "unclassified");
  }
  return `/expenses?${query}`;
}

function monthEnd(month: string) {
  const [year, value] = month.split("-").map(Number);
  return new Date(Date.UTC(year!, value!, 0)).toISOString().slice(0, 10);
}

function formatMoney(value: string, currency: string) {
  const suffix = currency === "VND" ? "₫" : currency;
  return `${new Intl.NumberFormat("vi-VN").format(BigInt(value))} ${suffix}`;
}

function monthLabel(month: string) {
  const [year, value] = month.split("-");
  return `T${Number(value)}/${year}`;
}

function MonthlyVisual({ series }: Readonly<{ series: ExpenseBreakdownCurrencySeries }>) {
  const monthTotals = series.months.map((month) =>
    series.groups.reduce(
      (sum, group) =>
        sum + BigInt(group.monthly.find((entry) => entry.month === month)?.amountMinor ?? "0"),
      0n,
    ),
  );
  const maximum = monthTotals.reduce((max, value) => (value > max ? value : max), 0n);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Diễn biến chi phí theo tháng · {series.currency}</CardTitle>
        <CardDescription>
          Tổng nguồn chi đã ghi sổ trong từng tháng của kỳ đang chọn.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {series.months.map((month, index) => {
          const amount = monthTotals[index] ?? 0n;
          const width = maximum === 0n ? 0 : Number((amount * 1000n) / maximum) / 10;
          return (
            <div className="grid grid-cols-[5rem_1fr_auto] items-center gap-3" key={month}>
              <span className="text-sm text-muted-foreground">{monthLabel(month)}</span>
              <div className="h-3 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
              </div>
              <span className="min-w-32 text-right text-sm font-medium tabular-nums">
                {formatMoney(amount.toString(), series.currency)}
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function CurrencyReport({
  kind,
  series,
}: Readonly<{ kind: ExpenseBreakdownKind; series: ExpenseBreakdownCurrencySeries }>) {
  const unclassified = series.groups.find((group) => group.key === null);
  return (
    <section className="space-y-4" aria-label={`Báo cáo ${series.currency}`}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Giá trị trước VAT"
          period={series.currency}
          value={formatMoney(series.netMinor, series.currency)}
        />
        <KpiCard
          title="VAT đầu vào"
          period={series.currency}
          value={formatMoney(series.vatMinor, series.currency)}
        />
        <KpiCard
          title="Tổng thanh toán"
          period={series.currency}
          value={formatMoney(series.grossMinor, series.currency)}
        />
        <KpiCard
          title="Số nguồn chi"
          period="Bản ghi đã ghi sổ"
          value={new Intl.NumberFormat("vi-VN").format(BigInt(series.sourceCount))}
        />
      </div>
      {unclassified ? (
        <Alert>
          <AlertCircle className="size-4" />
          <AlertTitle>
            {kind === "payee"
              ? "Có khoản chưa xác định người nhận"
              : "Có khoản chưa xác định danh mục"}
          </AlertTitle>
          <AlertDescription>
            {formatMoney(unclassified.totalMinor, series.currency)} từ {unclassified.sourceCount}{" "}
            nguồn chi. Dòng “Chưa phân loại” bên dưới cho phép mở chi tiết.
          </AlertDescription>
        </Alert>
      ) : null}
      <MonthlyVisual series={series} />
      <Card>
        <CardHeader>
          <CardTitle>
            {kind === "payee" ? "Chi cho ai theo tháng" : "Chi theo danh mục và tháng"}
          </CardTitle>
          <CardDescription>Bấm một con số để mở đúng các nguồn chi cấu thành.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-56">
                  {kind === "payee" ? "Người/đơn vị nhận" : "Danh mục"}
                </TableHead>
                {series.months.map((month) => (
                  <TableHead className="min-w-32 text-right" key={month}>
                    {monthLabel(month)}
                  </TableHead>
                ))}
                <TableHead className="min-w-36 text-right">Tổng</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {series.groups.map((group) => (
                <TableRow key={group.key ?? "__unclassified"}>
                  <TableCell>
                    <div className="flex items-center gap-2 font-medium">
                      {group.name}
                      {group.key === null ? <Badge variant="outline">Chưa phân loại</Badge> : null}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {group.sourceCount} nguồn chi
                    </div>
                  </TableCell>
                  {series.months.map((month) => {
                    const point = group.monthly.find((entry) => entry.month === month);
                    return (
                      <TableCell className="text-right tabular-nums" key={month}>
                        {point && BigInt(point.amountMinor) !== 0n ? (
                          <Link
                            className="font-medium text-primary hover:underline"
                            href={expenseDrillDownHref(kind, group, month)}
                          >
                            {formatMoney(point.amountMinor, series.currency)}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatMoney(group.totalMinor, series.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {series.reconciliation.differenceMinor !== "0" ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Chưa đối soát</AlertTitle>
          <AlertDescription>
            Chênh lệch {formatMoney(series.reconciliation.differenceMinor, series.currency)} giữa
            tổng nhóm và nguồn chi.
          </AlertDescription>
        </Alert>
      ) : null}
    </section>
  );
}

export function ExpenseBreakdownReportWorkspace({
  kind,
}: Readonly<{ kind: ExpenseBreakdownKind }>) {
  const { client, hydrated, hasToken } = useAuthenticatedApiClient();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const query = useMemo(
    () => expenseBreakdownQuery(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );
  const [report, setReport] = useState<ExpenseBreakdownReport>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!hydrated) return;
    if (!hasToken) {
      setError("AUTH_REQUIRED");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const endpoint =
        kind === "payee" ? expenseBreakdownReportApi.byPayee : expenseBreakdownReportApi.byCategory;
      setReport(await client.data<ExpenseBreakdownReport>(`${endpoint}?${query}`));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể tải báo cáo chi phí.");
    } finally {
      setLoading(false);
    }
  }, [client, hasToken, hydrated, kind, query]);
  useEffect(() => void load(), [load]);

  function applyPeriod(form: FormData) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("startsOn", String(form.get("startsOn")));
    next.set("endsOn", String(form.get("endsOn")));
    router.replace(`${pathname}?${next}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodRangeNavigator />
        <div className="flex flex-wrap items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" size="sm" variant="outline">
                <ListFilter data-icon="inline-start" />
                Bộ lọc
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))]">
              <form action={applyPeriod} className="grid gap-4">
                <div>
                  <h3 className="font-medium">Bộ lọc kỳ báo cáo</h3>
                  <p className="text-sm text-muted-foreground">
                    Chọn khoảng ngày tùy chỉnh. Bộ lọc được giữ trên URL.
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="expense-report-starts-on">Từ ngày</Label>
                    <Input
                      id="expense-report-starts-on"
                      name="startsOn"
                      type="date"
                      defaultValue={query.get("startsOn")!}
                      required
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="expense-report-ends-on">Đến ngày</Label>
                    <Input
                      id="expense-report-ends-on"
                      name="endsOn"
                      type="date"
                      defaultValue={query.get("endsOn")!}
                      required
                    />
                  </div>
                </div>
                <Button type="submit">Áp dụng bộ lọc</Button>
              </form>
            </PopoverContent>
          </Popover>
          <Button type="button" size="sm" variant="outline" onClick={() => void load()}>
            <RefreshCw data-icon="inline-start" />
            Làm mới
          </Button>
        </div>
      </div>
      {loading ? <Skeleton className="h-96 w-full" /> : null}
      {!loading && error ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Không thể tải báo cáo</AlertTitle>
          <AlertDescription>
            {error === "AUTH_REQUIRED" ? "Cần đăng nhập để xem dữ liệu." : error}
          </AlertDescription>
        </Alert>
      ) : null}
      {!loading && !error && report?.seriesByCurrency.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            Chưa có chi phí đã ghi sổ trong kỳ này.
          </CardContent>
        </Card>
      ) : null}
      {!loading && !error
        ? report?.seriesByCurrency.map((series) => (
            <CurrencyReport kind={kind} series={series} key={series.currency} />
          ))
        : null}
    </div>
  );
}
