"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AlertCircle, Camera, Filter, Search } from "lucide-react";
import {
  FinancialDataTable,
  type FinancialColumn,
} from "@/components/financial/financial-data-table";
import { MoneyCell } from "@/components/financial/money-cell";
import { StatusBadge } from "@/components/financial/status-badge";
import { PeriodRangeNavigator } from "@/components/layout/period-range-navigator";
import { PaymentEvidenceGapsCard } from "@/components/tax/payment-evidence-gaps-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { FinancialStatementKind, FinancialStatementLine } from "@/lib/api";
import { ReportFilterSheet } from "./statement-filter-popover";
import { ReportKpis } from "./statement-kpi-grid";
import { titleByKind } from "./statement-period-queries";
import { vatReadinessMessage } from "./statement-report-normalization";
import { SourceDialog } from "./statement-source-dialog";
import { useFinancialStatementReport } from "./use-financial-statement-report";
import { VatItemActionDialog } from "./vat-item-action-dialog";
import { VatReconciliationItemsCard } from "./vat-reconciliation-items-card";

export function FinancialStatementWorkspace({
  kind,
  routeValue,
}: Readonly<{ kind: FinancialStatementKind; routeValue?: string }>) {
  const router = useRouter();
  const pathname = usePathname();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedLine, setSelectedLine] = useState<FinancialStatementLine>();
  const {
    query,
    report,
    loading,
    error,
    capturing,
    captureSnapshot,
    vatActionItem,
    setVatActionItem,
    vatAction,
    setVatAction,
    vatActionReason,
    setVatActionReason,
    vatActionTaxCode,
    setVatActionTaxCode,
    vatActionState,
    setVatActionState,
    vatActionSaving,
    applyVatAction,
  } = useFinancialStatementReport(kind, routeValue);

  const apply = useCallback(
    (form: FormData) => {
      const next = new URLSearchParams();
      for (const [key, value] of form.entries())
        if (String(value).trim()) next.set(key, String(value).trim());
      setFiltersOpen(false);
      router.push(`${pathname}?${next}`);
    },
    [pathname, router],
  );

  const columns = useMemo<readonly FinancialColumn<FinancialStatementLine>[]>(
    () => [
      {
        id: "line",
        header: "Chỉ tiêu",
        cell: (line) => (
          <div className="flex flex-col gap-1">
            <span className="font-medium">{line.label}</span>
            <span className="text-xs text-muted-foreground">{line.lineCode}</span>
          </div>
        ),
      },
      {
        id: "amount",
        header: "Số tiền",
        align: "right",
        cell: (line) => <MoneyCell minor={line.amountMinor} />,
      },
      {
        id: "sources",
        header: "Nguồn",
        align: "right",
        cell: (line) => (
          <Button size="sm" variant="outline" onClick={() => setSelectedLine(line)}>
            <Search data-icon="inline-start" />
            Xem nguồn
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <PeriodRangeNavigator />
          <Badge variant="outline">{report?.framework ?? query.get("framework")}</Badge>
          <StatusBadge status={report?.final ? "verified" : "needs_review"} />
          <Badge variant="secondary">
            {kind === "profit_and_loss"
              ? `${report?.basis ?? query.get("basis")} basis`
              : titleByKind[kind]}
          </Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setFiltersOpen(true)}>
            <Filter data-icon="inline-start" />
            Bộ lọc
          </Button>
          {report && (
            <Button disabled={capturing} onClick={() => void captureSnapshot()}>
              <Camera data-icon="inline-start" />
              {capturing ? "Đang chốt..." : "Chốt dữ liệu"}
            </Button>
          )}
        </div>
      </div>
      {report && (!report.final || report.equation?.balanced === false) ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Báo cáo chưa sẵn sàng</AlertTitle>
          <AlertDescription>
            <div className="flex flex-wrap items-center gap-3">
              <span>
                {report.equation?.balanced === false
                  ? `Balance Sheet lệch ${report.equation.differenceMinor} minor units. Không có hidden plug.`
                  : kind === "vat_reconciliation"
                    ? vatReadinessMessage(report)
                    : "Còn mapping, evidence hoặc reconciliation exception cần xử lý trước khi dùng số liệu như bản final."}
              </span>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}
      {kind === "vat_reconciliation" ? (
        <PaymentEvidenceGapsCard startsOn={query.get("startsOn")} endsOn={query.get("endsOn")} />
      ) : null}
      {report ? <ReportKpis report={report} /> : null}
      <Card>
        <CardHeader>
          <CardTitle>{titleByKind[kind]}</CardTitle>
          <CardDescription>
            {report
              ? `${report.range.startsOn ?? "Inception"} → ${report.range.endsOn} · cutoff ${report.asOfInstant}`
              : "Đọc từ posted ledger theo cutoff đã chọn."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FinancialDataTable
            rows={report?.lines ?? []}
            columns={columns}
            rowKey={(line) => line.lineCode}
            loading={loading}
            error={error}
            emptyTitle="Chưa có dòng báo cáo"
            emptyDescription="Hãy duyệt mapping và post journal cho kỳ đã chọn."
          />
        </CardContent>
      </Card>
      {kind === "vat_reconciliation" ? (
        <VatReconciliationItemsCard
          report={report}
          onResolveTaxCode={(item) => {
            setVatActionItem(item);
            setVatAction("resolve-tax-code");
            setVatActionTaxCode(item.taxCode ?? "");
            setVatActionReason("Bổ sung mã thuế VAT theo chứng từ và chính sách đã duyệt");
          }}
          onReviewVat={(item) => {
            setVatActionItem(item);
            setVatAction("review-vat");
            setVatActionTaxCode(item.taxCode ?? "");
            setVatActionState("eligible");
            setVatActionReason("Xác nhận phân loại VAT theo chứng từ nguồn");
          }}
        />
      ) : null}
      {report?.unmappedAccountCodes?.length ? (
        <Alert>
          <AlertTitle>Tài khoản chưa mapping</AlertTitle>
          <AlertDescription>{report.unmappedAccountCodes.join(", ")}</AlertDescription>
        </Alert>
      ) : null}
      <ReportFilterSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        query={query}
        kind={kind}
        onApply={apply}
      />
      <SourceDialog
        report={report}
        line={selectedLine}
        onClose={() => setSelectedLine(undefined)}
      />
      <VatItemActionDialog
        item={vatActionItem}
        action={vatAction}
        state={vatActionState}
        onStateChange={setVatActionState}
        taxCode={vatActionTaxCode}
        onTaxCodeChange={setVatActionTaxCode}
        reason={vatActionReason}
        onReasonChange={setVatActionReason}
        saving={vatActionSaving}
        onClose={() => {
          setVatActionItem(undefined);
          setVatAction(undefined);
          setVatActionTaxCode("");
        }}
        onConfirm={applyVatAction}
      />
    </div>
  );
}
