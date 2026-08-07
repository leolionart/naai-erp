import { Suspense } from "react";
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

  let title = "Hóa đơn";
  let description = "Quản lý hóa đơn bán ra, mua vào và giảm trừ (credit note).";

  if (type === "sales_invoice") {
    title = "Hóa đơn bán ra";
    description = "Quản lý danh sách các hóa đơn bán ra phát sinh doanh thu.";
  } else if (type === "purchase_invoice") {
    title = "Hóa đơn mua vào";
    description = "Quản lý các hóa đơn mua hàng và dịch vụ từ nhà cung cấp.";
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
