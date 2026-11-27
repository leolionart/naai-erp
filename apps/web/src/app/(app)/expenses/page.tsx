import { Suspense } from "react";
import { ModulePage } from "@/components/layout/module-page";
import { Skeleton } from "@/components/ui/skeleton";
import { FocusedRecordListWorkspace } from "../../workspaces/focused-record-workspaces";

export default function ExpensesPage() {
  return (
    <ModulePage
      title="Quản lý chi phí"
      description="Xem toàn bộ hóa đơn mua vào và chi phí chưa có hóa đơn; chỉ lọc khi cần."
    >
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <FocusedRecordListWorkspace kind="expenses" />
      </Suspense>
    </ModulePage>
  );
}
