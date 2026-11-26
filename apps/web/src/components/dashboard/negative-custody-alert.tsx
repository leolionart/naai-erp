"use client";

import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";
import type { NegativeCustodyAlertContract } from "@naai-erp/contracts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatMinorVnd } from "@/lib/format";

export function NegativeCustodyAlert({
  alert,
  ownerCashCustodyMinor,
}: Readonly<{
  alert?: NegativeCustodyAlertContract | null | undefined;
  ownerCashCustodyMinor?: string | null | undefined;
}>) {
  const rawBalance = alert?.balanceMinor ?? ownerCashCustodyMinor ?? "0";
  const balance = /^-?\d+$/.test(rawBalance) ? BigInt(rawBalance) : 0n;
  const isNegative = Boolean(alert?.isNegative) || balance < 0n;
  if (!isNegative) return null;

  const deficitMinor = alert?.deficitMinor ?? (-balance).toString();
  const accountCode = alert?.custodyAccountCode ?? "111-OWNER-CUSTODY";

  return (
    <Alert variant="destructive">
      <AlertTriangle className="size-4" />
      <AlertTitle>
        Cảnh báo quỹ tiền mặt do chủ giữ ({accountCode}) đang âm ({formatMinorVnd(balance)})
      </AlertTitle>
      <AlertDescription className="space-y-2">
        <p>
          Tổng chi từ quỹ tiền mặt do chủ giữ đang vượt số dư trên sổ cái{" "}
          <span className="font-semibold">{formatMinorVnd(deficitMinor)}</span>. Quỹ tiền mặt thực
          tế không thể âm — đề xuất phân loại lại các khoản chi vượt sang{" "}
          <span className="font-semibold">Chủ chi hộ (owner_paid · TK 3388)</span> hoặc thực hiện
          kiểm quỹ cuối tháng.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={alert?.actionHref ?? "/expenses"}>
              Đổi nguồn tiền sang owner_paid <ChevronRight className="ml-1 size-3.5" />
            </Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/accounting/period-close?tab=cash-count">
              Mở Kiểm quỹ &amp; Đóng kỳ <ChevronRight className="ml-1 size-3.5" />
            </Link>
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}

export function DashboardOperatingAlerts({
  configurationWarnings,
  ownerCashCustodyMinor,
  negativeOwnerCustodyAlert,
}: Readonly<{
  configurationWarnings?: readonly string[] | undefined;
  ownerCashCustodyMinor?: string | null | undefined;
  negativeOwnerCustodyAlert?: NegativeCustodyAlertContract | null | undefined;
}>) {
  return (
    <>
      {configurationWarnings?.includes("foreign_currency_excluded_from_totals") ? (
        <Alert>
          <AlertTitle>Có chứng từ/bút toán ngoại tệ chưa được tính vào tổng</AlertTitle>
          <AlertDescription>
            Doanh thu, chi phí và DSO chỉ cộng các khoản bằng đồng tiền gốc của công ty. Các khoản
            ngoại tệ trong kỳ được loại khỏi tổng thay vì cộng lẫn đồng tiền.
          </AlertDescription>
        </Alert>
      ) : null}
      <NegativeCustodyAlert
        alert={negativeOwnerCustodyAlert}
        ownerCashCustodyMinor={ownerCashCustodyMinor}
      />
    </>
  );
}
