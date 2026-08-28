import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AutomationApiDialog } from "@/components/automation-api-dialog";
import { ModulePage } from "@/components/layout/module-page";
import { Skeleton } from "@/components/ui/skeleton";
import { FocusedRecordListWorkspace } from "../../workspaces/focused-record-workspaces";

export default async function RevenuePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  if (type === "purchase_invoice") redirect("/expenses?invoiceStatus=present");
  const title = type === "sales_invoice" ? "Doanh thu có hóa đơn" : "Quản lý doanh thu";
  const description =
    type === "sales_invoice"
      ? "Các hóa đơn bán ra phát sinh trên trục doanh thu đã xuất hóa đơn."
      : "Xem toàn bộ hoạt động doanh thu; dùng bộ lọc để tách bản ghi có hoặc chưa có hóa đơn.";
  return (
    <ModulePage
      title={title}
      description={description}
      actions={<AutomationApiDialog resources={["revenue"]} />}
    >
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <FocusedRecordListWorkspace kind="documents" />
      </Suspense>
    </ModulePage>
  );
}
