import { Suspense } from "react";
import { ModulePage } from "@/components/layout/module-page";
import { Skeleton } from "@/components/ui/skeleton";
import { ExpenseBreakdownReportWorkspace } from "../../../../workspaces/expense-breakdown-report-workspace";

export default function Page() {
  return (
    <ModulePage
      title="Chi theo danh mục và tháng"
      section="Thống kê chi phí"
      description="So sánh từng danh mục chi phí đã ghi sổ theo tháng và mở lại đúng nguồn cấu thành."
    >
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <ExpenseBreakdownReportWorkspace kind="category" />
      </Suspense>
    </ModulePage>
  );
}
