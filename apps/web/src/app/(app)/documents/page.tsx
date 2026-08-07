import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ModulePage } from "@/components/layout/module-page";
import { Skeleton } from "@/components/ui/skeleton";
import { FocusedRecordListWorkspace } from "../../workspaces/focused-record-workspaces";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const params = await searchParams;
  const type = params.type;
  if (type === "purchase_invoice") redirect("/expenses?invoiceStatus=present");

  let title = "Quản lý doanh thu";
  let description =
    "Xem toàn bộ hoạt động doanh thu; dùng bộ lọc để tách bản ghi có hoặc chưa có hóa đơn.";

  if (type === "sales_invoice") {
    title = "Doanh thu có hóa đơn";
    description = "Các hóa đơn bán ra phát sinh trên trục doanh thu đã xuất hóa đơn.";
  } else if (type === "credit_note") {
    title = "Hóa đơn giảm trừ (Credit Note)";
    description = "Quản lý các chứng từ ghi nhận giảm trừ giá trị hóa đơn.";
  }

  return (
    <ModulePage title={title} description={description}>
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <FocusedRecordListWorkspace kind="documents" />
      </Suspense>
    </ModulePage>
  );
}
