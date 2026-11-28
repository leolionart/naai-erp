"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { KpiCard } from "@/components/financial/kpi-card";
import { MoneyCell } from "@/components/financial/money-cell";
import { Button } from "@/components/ui/button";
import type { FinancialStatementReport } from "@/lib/api";
import { taxReviewQueueHref, vatSourceHref } from "./statement-report-normalization";

export function ReportKpis({ report }: Readonly<{ report: FinancialStatementReport }>) {
  const period = report.range.startsOn
    ? `${report.range.startsOn} → ${report.range.endsOn}`
    : `As of ${report.range.endsOn}`;
  const taxReviewHref =
    report.statement === "vat_reconciliation" ? vatSourceHref(report) : taxReviewQueueHref(report);
  if (report.statement === "balance_sheet" && report.equation)
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Tài sản"
          period={period}
          value={<MoneyCell minor={report.equation.assetsMinor} />}
        />
        <KpiCard
          title="Nợ phải trả"
          period={period}
          value={<MoneyCell minor={report.equation.liabilitiesMinor} />}
        />
        <KpiCard
          title="Vốn chủ sở hữu"
          period={period}
          value={<MoneyCell minor={report.equation.equityMinor} />}
        />
        <KpiCard
          title="Chênh lệch"
          period="Assets − Liabilities − Equity"
          value={<MoneyCell minor={report.equation.differenceMinor} />}
        />
      </div>
    );
  if (report.statement === "cash_flow")
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Operating"
          period={period}
          value={<MoneyCell minor={report.operatingCashFlowMinor ?? "0"} />}
        />
        <KpiCard
          title="Investing"
          period={period}
          value={<MoneyCell minor={report.investingCashFlowMinor ?? "0"} />}
        />
        <KpiCard
          title="Financing"
          period={period}
          value={<MoneyCell minor={report.financingCashFlowMinor ?? "0"} />}
        />
        <KpiCard
          title="Net movement"
          period="Opening + movement = closing"
          value={<MoneyCell minor={report.netCashMovementMinor ?? report.totalMinor ?? "0"} />}
        />
      </div>
    );
  if (report.statement === "vat_reconciliation")
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="VAT đầu ra"
          period={period}
          value={<MoneyCell minor={report.totals?.outputVatMinor ?? "0"} />}
        />
        <KpiCard
          title="VAT đầu vào"
          period={period}
          value={<MoneyCell minor={report.totals?.inputVatMinor ?? "0"} />}
        />
        <KpiCard
          title="Input đủ điều kiện"
          period={period}
          value={<MoneyCell minor={report.totals?.eligibleInputVatMinor ?? "0"} />}
        />
        <KpiCard
          title="VAT phải nộp"
          period="Output − eligible input"
          value={<MoneyCell minor={report.totals?.netVatPayableMinor ?? "0"} />}
          footer={
            <Button variant="outline" size="sm" asChild>
              <Link href={taxReviewHref}>
                Mở hàng chờ VAT <ChevronRight className="ml-1 size-3.5" />
              </Link>
            </Button>
          }
        />
      </div>
    );
  const values = new Map(report.lines.map((line) => [line.lineCode, line.amountMinor]));
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        title="Doanh thu"
        period={period}
        value={<MoneyCell minor={values.get("revenue") ?? "0"} />}
      />
      <KpiCard
        title="Gross profit"
        period={period}
        value={<MoneyCell minor={values.get("gross_profit") ?? "0"} />}
      />
      <KpiCard
        title="Operating profit"
        period={period}
        value={<MoneyCell minor={values.get("operating_profit") ?? "0"} />}
      />
      <KpiCard
        title="Net profit"
        period={period}
        value={<MoneyCell minor={values.get("net_profit") ?? report.totalMinor ?? "0"} />}
      />
    </div>
  );
}
