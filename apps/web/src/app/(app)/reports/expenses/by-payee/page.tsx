import { Suspense } from "react";
import { ModulePage } from "@/components/layout/module-page";
import { Skeleton } from "@/components/ui/skeleton";
import { ExpenseBreakdownReportWorkspace } from "../../../../workspaces/expense-breakdown-report-workspace";

export default function Page() {
  return (
    <ModulePage
      title="Chi cho ai theo tháng"
      section="Thống kê chi phí"
      description="Theo dõi chi phí đã ghi sổ theo người hoặc đơn vị nhận tiền trong từng tháng."
    >
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <ExpenseBreakdownReportWorkspace kind="payee" />
      </Suspense>
    </ModulePage>
  );
}
