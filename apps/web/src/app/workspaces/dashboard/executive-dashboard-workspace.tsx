"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { ListChecks } from "lucide-react";
import {
  DashboardPreviewDialog,
  type DashboardPreview as Preview,
} from "@/components/dashboard/dashboard-preview-dialog";
import { ExpenseOverviewChart } from "@/components/dashboard/expense-overview-chart";
import { DashboardOperatingAlerts } from "@/components/dashboard/negative-custody-alert";
import { ModulePage } from "@/components/layout/module-page";
import { PeriodRangeNavigator } from "@/components/layout/period-range-navigator";
import { PaymentEvidenceGapsCard } from "@/components/tax/payment-evidence-gaps-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardFilters } from "./dashboard-filters-popover";
import { effectiveEndsOn } from "./dashboard-queries";
import { FinancialHealthSection } from "./financial-health-section";
import { OperatingPulseSection } from "./operating-pulse-section";
import { RevenueTrendCard } from "./revenue-trend-card";
import { useDashboardData, useExpenseOverviewRows } from "./use-dashboard-data";

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
  const baseMonthly = operating?.financials.monthly ?? [];

  const chartPoints: readonly Readonly<{ label: string; valueMinor: string }>[] = baseMonthly.map(
    (row) => ({
      label: String(row.period ?? ""),
      valueMinor: String(row.revenueMinor ?? "0"),
    }),
  );
  const displayedChartPoints = chartPoints;

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
          {!loading ? (
            <DashboardOperatingAlerts
              configurationWarnings={operating?.financials.configurationWarnings}
              ownerCashCustodyMinor={operating?.financials.ownerCashCustodyMinor}
              negativeOwnerCustodyAlert={operating?.financials.negativeOwnerCustodyAlert}
            />
          ) : null}
          {!loading ? (
            <PaymentEvidenceGapsCard
              startsOn={search.get("startsOn")}
              endsOn={effectiveEndsOn(search)}
              compact
            />
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
              <OperatingPulseSection operating={operating} search={search} />
              <FinancialHealthSection data={data} search={search} />
            </>
          )}
          <RevenueTrendCard
            points={displayedChartPoints}
            currency={operating?.currency ?? performance?.currency ?? "VND"}
          />
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
      <DashboardPreviewDialog preview={preview} onClose={() => setPreview(undefined)} />
    </ModulePage>
  );
}
