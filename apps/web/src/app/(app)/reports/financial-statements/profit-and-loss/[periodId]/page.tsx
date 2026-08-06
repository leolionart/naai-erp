import { Suspense } from "react";
import { ModulePage } from "@/components/layout/module-page";
import { Skeleton } from "@/components/ui/skeleton";
import { FinancialStatementWorkspace } from "@/app/workspaces/financial-statement-workspaces";

export default function Page() {
  return (
    <ModulePage
      title="Báo cáo kết quả kinh doanh"
      section="Báo cáo tài chính"
      description="Accrual management P&L; cash view luôn được gắn nhãn riêng."
    >
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <FinancialStatementWorkspace kind="profit_and_loss" />
      </Suspense>
    </ModulePage>
  );
}
