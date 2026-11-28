"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { buildDashboardCitDrilldownEntries } from "../cit-estimate-presentation";
import { money, months, ratio } from "./dashboard-presentation";
import { useDashboardData } from "./use-dashboard-data";

export function DashboardMetricDrilldownWorkspace({ metricKey }: { metricKey: string }) {
  const { data, loading, error, search } = useDashboardData();
  const q = search.toString();
  const executive = data.executive;
  const performance = data.performance;
  const operating = data.operating;
  const profitAndLoss = data.profitAndLoss;
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
      actionLabel?: string;
      facts?: readonly Readonly<{ label: string; value: string }>[];
    }
  > = {
    revenue: {
      title: "Doanh thu thực tế",
      value: money(operating?.financials.revenueMinor, operating?.currency),
      formula: "Operating Dashboard API",
      sourceIds: [],
      canonicalHref: `/reports/performance/${encodeURIComponent(performance?.period.id ?? search.get("periodId") ?? "current")}?${q}`,
    },
    ros: {
      title: "ROS (Return on Sales)",
      value: ratio(operating?.financials.rosBps),
      formula: "Operating Dashboard API",
      sourceIds: [],
      canonicalHref: `/reports/financial-statements/profit-and-loss/current?${q}`,
    },
    profit: {
      title: "Lợi nhuận trước thuế",
      value: money(profitAndLoss?.profitBeforeTaxMinor, profitAndLoss?.currency),
      formula: "Profit & Loss API: profitBeforeTaxMinor",
      sourceIds: [],
      canonicalHref: `/reports/financial-statements/profit-and-loss/current?${q}`,
    },
    "profit-before-tax": {
      title: "Lợi nhuận trước thuế",
      value: money(profitAndLoss?.profitBeforeTaxMinor, profitAndLoss?.currency),
      formula: "Profit & Loss API: profitBeforeTaxMinor",
      sourceIds: [],
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
    ...buildDashboardCitDrilldownEntries({
      queryString: q,
      taxableProfitFormatted: money(operating?.financials.taxableProfitMinor, operating?.currency),
      corporateIncomeTaxFormatted: money(
        operating?.financials.corporateIncomeTaxMinor,
        operating?.currency,
      ),
      profitBeforeTaxFormatted: money(profitAndLoss?.profitBeforeTaxMinor, profitAndLoss?.currency),
      citIneligibleFormatted: money(
        data.taxExpenses?.citIneligibleMinor,
        data.taxExpenses?.currency,
      ),
      citUnreviewedFormatted: money(
        data.taxExpenses?.citUnreviewedMinor,
        data.taxExpenses?.currency,
      ),
      ...(operating?.financials.priorYearRevenueMinor != null
        ? {
            priorYearRevenueFormatted: money(
              operating.financials.priorYearRevenueMinor,
              operating.currency,
            ),
          }
        : {}),
      financials: operating?.financials,
    }),
    "cit-unreviewed": {
      title: "Chi phí CIT chờ review",
      value: money(data.taxExpenses?.citUnreviewedMinor, data.taxExpenses?.currency),
      formula: "Tax Expense Review API: citUnreviewedMinor",
      sourceIds: data.taxExpenses?.unreviewedItemIds ?? [],
      canonicalHref: `/reports/tax/expense-exceptions?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(q)), state: "unreviewed" }).toString()}`,
      actionLabel: "Mở hàng chờ và review",
    },
  };
  const detail = details[metricKey];
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
                {detail.facts?.length ? (
                  <dl className="mt-4 grid gap-2 border-t pt-4 text-sm sm:grid-cols-3">
                    {detail.facts.map((fact) => (
                      <div key={fact.label} className="min-w-0">
                        <dt className="text-muted-foreground">{fact.label}</dt>
                        <dd className="truncate font-medium tabular-nums" title={fact.value}>
                          {fact.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                {executive?.sourceBoundary.ledgerCutoffFingerprint ? (
                  <p className="mt-3 break-all font-mono text-xs text-muted-foreground">
                    Fingerprint: {executive.sourceBoundary.ledgerCutoffFingerprint}
                  </p>
                ) : null}
              </CardContent>
              <CardFooter>
                <Button asChild>
                  <Link href={detail.canonicalHref}>
                    {detail.actionLabel ?? "Mở báo cáo nguồn"} <ArrowRight data-icon="inline-end" />
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
