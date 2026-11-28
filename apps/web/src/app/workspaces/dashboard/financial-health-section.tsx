"use client";

import Link from "next/link";
import { Activity } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buildCitCardDescription } from "../cit-estimate-presentation";
import type { DashboardData } from "./dashboard-contracts";
import { money, ratio, shouldShowNetCompanyFunds } from "./dashboard-presentation";
import { effectiveEndsOn } from "./dashboard-queries";
import { MetricCard } from "./metric-card";

export function FinancialHealthSection({
  data,
  search,
}: {
  data: DashboardData;
  search: URLSearchParams;
}) {
  const q = search.toString();
  const executive = data.executive;
  const operating = data.operating;
  const profitAndLoss = data.profitAndLoss;
  const taxExpenses = data.taxExpenses;
  const vat = data.vat;
  const usingOperatingFallback = !operating;
  const overdueMinor = operating?.collections.overdueMinor ?? "0";
  const overdueCount = operating?.collections.overdueCount ?? 0;
  const dso =
    operating?.collections.dsoDays == null
      ? "N/A"
      : `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(operating.collections.dsoDays)} ngày`;
  const companyOwesOwnerMinor = operating?.financials.companyOwesOwnerMinor ?? "0";
  const ownerHoldsCompanyFundsMinor = operating?.financials.ownerHoldsCompanyFundsMinor ?? "0";
  const totalCompanyFundsMinor =
    operating?.financials.totalCompanyFundsMinor ?? operating?.financials.cashAndBankMinor ?? "0";
  const companyFundsReconciliationGapMinor =
    operating?.financials.companyFundsReconciliationGapMinor ?? "0";
  // Owner-settlement and net-funds values are canonical backend read-model fields.
  // Keep the frontend presentation-only: do not recalculate dashboard metrics here.
  const netCompanyFundsMinor = operating?.financials.netCompanyFundsMinor ?? "0";
  const showNetCompanyFunds = shouldShowNetCompanyFunds(companyOwesOwnerMinor);
  const taxableProfitMinor = operating?.financials.taxableProfitMinor;
  const corporateIncomeTaxMinor = operating?.financials.corporateIncomeTaxMinor;
  const projectPipelineRows = operating?.backlog.projectPipeline ?? [];

  return (
    <>
      <div className="flex items-center gap-2">
        <Activity aria-hidden="true" className="size-5 text-primary" />
        <div>
          <h2 className="text-lg font-semibold">Sức khỏe tài chính</h2>
          <p className="text-sm text-muted-foreground">
            Kết quả kinh doanh, tiền công ty, quyết toán với chủ, công nợ và nghĩa vụ thuế.
          </p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          title="Kết quả kinh doanh"
          value={money(
            profitAndLoss?.profitBeforeTaxMinor ?? operating?.financials.netProfitMinor,
            profitAndLoss?.currency ?? operating?.currency,
          )}
          description={`Doanh thu ${money(operating?.financials.revenueMinor, operating?.currency)} − Chi phí ${money(operating?.financials.expenseMinor, operating?.currency)} · Biên lợi nhuận: ${operating?.financials.rosBps == null ? "N/A" : ratio(operating.financials.rosBps)}.`}
          href={`/reports/financial-statements/profit-and-loss/current?${q}`}
          status={
            BigInt(
              profitAndLoss?.profitBeforeTaxMinor ?? operating?.financials.netProfitMinor ?? "0",
            ) < 0n
              ? "Đang lỗ kế toán"
              : "Có lãi kế toán"
          }
          variant="surface"
          trend={operating?.financials.monthly?.map((row) =>
            Number(BigInt(row.netProfitMinor ?? "0")),
          )}
        />
        <MetricCard
          title="Tiền công ty hiện có"
          value={money(totalCompanyFundsMinor, operating?.currency)}
          description={`Ngân hàng ${money(operating?.financials.bankAvailableMinor, operating?.currency)} · Tiền mặt két ${money(operating?.financials.companyCashOnHandMinor ?? "0", operating?.currency)}${BigInt(ownerHoldsCompanyFundsMinor) > 0n ? ` · Chủ còn giữ ${money(ownerHoldsCompanyFundsMinor, operating?.currency)}` : ""}.${BigInt(companyFundsReconciliationGapMinor) !== 0n ? ` Chênh lệch sổ: ${money(companyFundsReconciliationGapMinor, operating?.currency)}.` : ""}`}
          href={`/reports/financial-statements/balance-sheet/${search.get("asOfDate") ?? effectiveEndsOn(search)}?${q}`}
          status={BigInt(totalCompanyFundsMinor) > 0n ? "Sẵn sàng chi" : "Đã cạn quỹ"}
          variant="primary"
          trend={operating?.financials.monthly?.map((row) =>
            Number(BigInt(row.revenueMinor ?? "0")),
          )}
        />
        <MetricCard
          title={
            BigInt(companyOwesOwnerMinor) > 0n
              ? "Công ty đang nợ chủ doanh nghiệp"
              : BigInt(ownerHoldsCompanyFundsMinor) > 0n
                ? "Tiền công ty chủ đang giữ"
                : "Quyết toán với chủ doanh nghiệp"
          }
          value={money(
            BigInt(companyOwesOwnerMinor) > 0n
              ? companyOwesOwnerMinor
              : ownerHoldsCompanyFundsMinor,
            operating?.currency ?? executive?.currency,
          )}
          description={
            BigInt(companyOwesOwnerMinor) > 0n
              ? `Đã tự động trừ hết tiền công ty chủ giữ hộ trước khi tính nợ · Tiền ròng thực còn sau nghĩa vụ với chủ: ${money(netCompanyFundsMinor, operating?.currency ?? executive?.currency)}.`
              : BigInt(ownerHoldsCompanyFundsMinor) > 0n
                ? "Phần tiền công ty giao chủ giữ còn dư sau khi đã cấn trừ hết các khoản chủ chi hộ (công ty nợ chủ: 0 ₫)."
                : "Đã cân bằng — công ty không nợ chủ và chủ không còn giữ tiền dư của công ty."
          }
          href="/banking/owner-current"
          status={
            BigInt(companyOwesOwnerMinor) > 0n
              ? "Nguồn: quyết toán đã xác nhận"
              : BigInt(ownerHoldsCompanyFundsMinor) > 0n
                ? "Chủ đang giữ tiền công ty"
                : "Đã cân bằng"
          }
          variant={showNetCompanyFunds && BigInt(netCompanyFundsMinor) < 0n ? "danger" : "surface"}
        />
        <MetricCard
          title="Công nợ cần thu"
          value={money(data.aging?.baseOutstandingTotalMinor, data.aging?.baseCurrency)}
          description={`Đã quá hạn ${money(overdueMinor, data.aging?.baseCurrency)} · DSO: ${dso}`}
          href={`/receivables?asOf=${search.get("asOfDate") ?? effectiveEndsOn(search)}`}
          status={overdueCount ? `${overdueCount} khoản quá hạn` : data.aging?.tieStatus}
          provisional={usingOperatingFallback}
          variant={overdueCount > 0 ? "danger" : "surface"}
        />
        <MetricCard
          title="Thuế TNDN tạm tính"
          value={money(corporateIncomeTaxMinor, profitAndLoss?.currency)}
          description={`${buildCitCardDescription({
            taxableProfitFormatted: money(taxableProfitMinor, profitAndLoss?.currency),
            financials: operating?.financials,
          })} · Chi phí không trừ CIT: ${money(taxExpenses?.citIneligibleMinor, taxExpenses?.currency)}${BigInt(taxExpenses?.citUnreviewedMinor ?? "0") > 0n ? ` · Chờ review CIT: ${money(taxExpenses?.citUnreviewedMinor, taxExpenses?.currency)}` : ""}.`}
          href={
            taxExpenses?.unreviewedItemIds.length
              ? `/reports/tax/expense-exceptions?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(q)), state: "unreviewed" }).toString()}`
              : `/reports/financial-statements/profit-and-loss/current?${q}`
          }
          status={
            operating?.financials.corporateIncomeTaxRateBps == null
              ? "Thiếu chính sách thuế TNDN"
              : taxExpenses?.unreviewedItemIds.length
                ? `${taxExpenses.unreviewedItemIds.length} khoản chờ review CIT`
                : taxExpenses?.status
          }
          provisional={
            taxExpenses?.status !== "ready" ||
            operating?.financials.corporateIncomeTaxBasis === "no_prior_year_revenue"
          }
          variant="surface"
        />
        <MetricCard
          title="VAT phải nộp"
          value={money(vat?.netVatPayableMinor, vat?.currency)}
          description={`VAT đầu ra ${money(vat?.outputVatMinor, vat?.currency)} − VAT đầu vào đủ điều kiện ${money(vat?.eligibleInputVatMinor, vat?.currency)}${BigInt(vat?.unreviewedInputVatMinor ?? "0") > 0n ? ` · VAT đầu vào chờ review: ${money(vat?.unreviewedInputVatMinor, vat?.currency)}` : ""}.`}
          href={`/reports/tax/vat-reconciliation/current?${q}`}
          status={
            vat?.unreviewedItemIds.length
              ? `${vat.unreviewedItemIds.length} khoản chờ review VAT`
              : vat?.status
          }
          provisional={vat?.status !== "ready"}
          variant="surface"
        />
      </div>
      {projectPipelineRows.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Dự án đang tạo doanh thu</CardTitle>
            <CardDescription>
              So sánh hợp đồng, hóa đơn đã xuất và phần còn lại theo từng dự án.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-5 md:grid-cols-2">
              {projectPipelineRows.slice(0, 6).map((project) => {
                const projectId = project.projectId ?? "";
                const progress = (project.invoicedProgressBps ?? 0) / 100;
                const content = (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate font-medium group-hover:text-primary">
                        {project.name ?? project.code ?? "Dự án chưa đặt tên"}
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {progress.toFixed(0)}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-background">
                      <div
                        className="h-full rounded-full bg-primary transition-[width]"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className="flex justify-between gap-3 text-xs text-muted-foreground">
                      <span>Đã xuất {money(project.invoicedMinor, operating?.currency)}</span>
                      <span>Còn {money(project.backlogMinor, operating?.currency)}</span>
                    </div>
                  </>
                );
                return projectId ? (
                  <Link
                    key={projectId}
                    href={`/projects/${encodeURIComponent(projectId)}`}
                    className="group space-y-2 rounded-lg bg-muted/40 p-4 transition-colors hover:bg-muted"
                  >
                    {content}
                  </Link>
                ) : (
                  <div
                    key={`${project.name ?? project.code ?? "unresolved"}-${String(project.invoicedMinor ?? "0")}`}
                    className="space-y-2 rounded-lg bg-muted/40 p-4"
                  >
                    {content}
                    <p className="text-xs text-muted-foreground">
                      Chưa thể mở dự án vì thiếu mã liên kết.
                    </p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
