"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";
import type { PaymentEvidenceGapsReportContract } from "@naai-erp/contracts";
import { MoneyCell } from "@/components/financial/money-cell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  financialStatementsApi,
  type TaxExpenseException,
  useAuthenticatedApiClient,
} from "@/lib/api";

export const fallbackTaxExceptions: readonly TaxExpenseException[] = [
  {
    id: "exp-salary-01",
    expenseId: "exp-salary-01",
    description: "Chi trả lương nhân viên & trợ cấp tháng 8/2026 (Chi phí không hóa đơn GTGT)",
    expenseDate: "2026-08-05",
    partyName: "Bảng lương Công ty",
    bookedMinor: "20000000",
    citEligibleMinor: "20000000",
    citIneligibleMinor: "0",
    citState: "eligible",
    vatEligibleMinor: "0",
    vatIneligibleMinor: "0",
    vatState: "ineligible",
    evidenceState: "verified",
    reason: "Chi phí lương nhân viên theo bảng lương; không thuộc đối tượng xuất hóa đơn GTGT.",
    sourceIds: ["payroll:2026-08"],
  },
  {
    id: "exp-salary-02",
    expenseId: "exp-salary-02",
    description: "Chi trả lương & thưởng dự án (Chủ sở hữu chi hộ vượt 90tr rút)",
    expenseDate: "2026-08-06",
    partyName: "Chủ sở hữu chi hộ (TK 3388)",
    bookedMinor: "5000000",
    citEligibleMinor: "5000000",
    citIneligibleMinor: "0",
    citState: "eligible",
    vatEligibleMinor: "0",
    vatIneligibleMinor: "0",
    vatState: "ineligible",
    evidenceState: "verified",
    reason: "Chi phí nhân sự do chủ sở hữu chi hộ từ tiền cá nhân vượt số tiền rút ngân hàng.",
    sourceIds: ["owner_loan:3388"],
  },
  {
    id: "exp-cash-03",
    expenseId: "exp-cash-03",
    description: "Chi phí gửi xe & mua đồ dùng nhỏ lẻ chưa có hóa đơn GTGT",
    expenseDate: "2026-08-02",
    partyName: "Chi lẻ tiền mặt",
    bookedMinor: "1500000",
    citEligibleMinor: "0",
    citIneligibleMinor: "1500000",
    citState: "review",
    vatEligibleMinor: "0",
    vatIneligibleMinor: "0",
    vatState: "ineligible",
    evidenceState: "missing",
    reason: "Khoản chi tiền mặt nhỏ lẻ chưa bổ sung bảng kê chứng từ hợp lệ.",
    sourceIds: ["cash:petty"],
  },
];

export function PaymentEvidenceGapsCard({
  startsOn,
  endsOn,
  compact = false,
}: Readonly<{
  startsOn?: string | null | undefined;
  endsOn?: string | null | undefined;
  compact?: boolean | undefined;
}>) {
  const { client: api, hydrated, hasToken } = useAuthenticatedApiClient();
  const [report, setReport] = useState<PaymentEvidenceGapsReportContract>();

  useEffect(() => {
    if (!hydrated || !hasToken) return;
    const qs = new URLSearchParams();
    if (startsOn) qs.set("startsOn", startsOn);
    if (endsOn) qs.set("endsOn", endsOn);
    let active = true;
    void api
      .data<PaymentEvidenceGapsReportContract>(
        `${financialStatementsApi.paymentEvidenceGaps}${qs.toString() ? `?${qs}` : ""}`,
      )
      .then((data) => {
        if (active) setReport(data);
      })
      .catch(() => {
        if (active) setReport(undefined);
      });
    return () => {
      active = false;
    };
  }, [api, endsOn, hasToken, hydrated, startsOn]);

  if (!report || report.items.length === 0) return null;

  return (
    <Alert>
      <AlertTriangle className="size-4" />
      <AlertTitle>
        Cảnh báo thiếu chứng từ thanh toán không dùng tiền mặt ({report.counts.recordCount} chứng
        từ)
      </AlertTitle>
      <AlertDescription className="space-y-3">
        <p>
          Các khoản từ ngưỡng{" "}
          <span className="font-medium">
            <MoneyCell minor={report.nonCashThresholdMinor} />
          </span>{" "}
          (hoặc tổng mua cùng ngày cùng nhà cung cấp đạt ngưỡng) chưa có chứng từ chuyển khoản/thẻ
          hợp lệ vẫn được ghi sổ kế toán bình thường, nhưng tạm giữ mức khấu trừ bằng 0 (CIT giữ lại{" "}
          <MoneyCell minor={report.totals.withheldCitMinor} /> · VAT giữ lại{" "}
          <MoneyCell minor={report.totals.withheldVatMinor} />) cho đến khi bổ sung chứng từ thanh
          toán hoặc đối soát ngân hàng.
        </p>
        {!compact ? (
          <div className="divide-y rounded-md border bg-background">
            {report.items.slice(0, 8).map((item) => {
              const href =
                item.sourceType === "purchase_invoice"
                  ? `/documents/${encodeURIComponent(item.sourceId)}`
                  : `/expenses/${encodeURIComponent(item.sourceId)}`;
              return (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <span className="font-medium">{item.description}</span>
                    <span className="ml-2 text-muted-foreground">
                      {item.date} · {item.partyName ?? item.sourceId} · PT: {item.paymentMethod}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      Gross <MoneyCell minor={item.grossMinor} />
                    </Badge>
                    <Button variant="ghost" size="sm" asChild className="h-7 px-2 text-xs">
                      <Link href={href}>
                        Cập nhật chứng từ TT <ChevronRight className="ml-0.5 size-3" />
                      </Link>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
