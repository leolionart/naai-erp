"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { MoneyCell } from "@/components/financial/money-cell";
import { StatusBadge } from "@/components/financial/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { FinancialStatementReport } from "@/lib/api";
import type { VatReconciliationItem } from "./use-financial-statement-report";

export function VatReconciliationItemsCard({
  report,
  onResolveTaxCode,
  onReviewVat,
}: Readonly<{
  report?: FinancialStatementReport;
  onResolveTaxCode: (item: VatReconciliationItem) => void;
  onReviewVat: (item: VatReconciliationItem) => void;
}>) {
  if (!report) return null;
  if (!report.items?.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Chi tiết nguồn VAT</CardTitle>
          <CardDescription>Không có dòng VAT trong khoảng thời gian đã chọn.</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  return (
    <Card id="vat-source-items" className="scroll-mt-6">
      <CardHeader>
        <CardTitle>Chi tiết nguồn VAT</CardTitle>
        <CardDescription>
          Xử lý mã thuế, trạng thái review và chứng từ ngay trên màn hình đối soát này.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="divide-y rounded-md border">
          {report.items.map((item) => {
            const invalidCode = item.taxCodeApproved === false;
            const needsReview = item.nextActions?.includes("review-vat");
            const sourceLabel =
              item.sourceType === "purchase_invoice"
                ? "Hóa đơn mua vào"
                : item.sourceType === "purchase_credit_note"
                  ? "Điều chỉnh mua vào"
                  : item.sourceType === "sales_invoice"
                    ? "Hóa đơn bán ra"
                    : item.sourceType === "sales_credit_note"
                      ? "Điều chỉnh bán ra"
                      : "Chi phí";
            const sourceHref =
              item.sourceType === "expense"
                ? `/expenses/${encodeURIComponent(item.sourceId)}`
                : `/documents/${encodeURIComponent(item.sourceId)}`;
            return (
              <div
                key={item.id}
                className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{sourceLabel}</span>
                    <Badge variant="outline">Dòng {item.lineNumber ?? 1}</Badge>
                    <StatusBadge status={item.reviewState ?? "eligible"} />
                    {item.direction === "reversal" ? <Badge variant="secondary">Đảo</Badge> : null}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Nguồn: <span className="font-mono">{item.sourceId}</span>
                    {item.journalId ? ` · Journal ${item.journalId}` : ""}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    <span>
                      VAT: <MoneyCell minor={item.taxMinor} />
                    </span>
                    <span>
                      Mã thuế: {item.taxCode ?? "Chưa gán"}
                      {invalidCode ? (
                        <span className="ml-1 text-destructive">(chưa được duyệt)</span>
                      ) : null}
                    </span>
                    <span>Chứng từ: {item.presentEvidenceTypes?.length ? "Đã có" : "Thiếu"}</span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  {invalidCode && item.sourceType === "purchase_invoice" ? (
                    <Button size="sm" variant="outline" onClick={() => onResolveTaxCode(item)}>
                      Gán mã thuế
                    </Button>
                  ) : null}
                  {needsReview ? (
                    <Button size="sm" variant="outline" onClick={() => onReviewVat(item)}>
                      Review VAT
                    </Button>
                  ) : null}
                  <Button size="sm" variant="ghost" asChild>
                    <Link href={sourceHref}>
                      Xem nguồn <ChevronRight className="ml-1 size-3.5" />
                    </Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
