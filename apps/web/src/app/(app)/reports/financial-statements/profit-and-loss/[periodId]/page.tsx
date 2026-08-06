import { Suspense } from "react";
import { ModulePage } from "@/components/layout/module-page";
import { Skeleton } from "@/components/ui/skeleton";
import { FinancialStatementWorkspace } from "@/app/workspaces/financial-statement-workspaces";

export default async function Page({ params }: { params: Promise<{ periodId: string }> }) {
  const { periodId } = await params;
  return (
    <ModulePage
      title="Báo cáo kết quả kinh doanh"
      section="Báo cáo tài chính"
      description="Accrual management P&L; cash view luôn được gắn nhãn riêng."
    >
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <FinancialStatementWorkspace kind="profit_and_loss" routeValue={periodId} />
      </Suspense>
    </ModulePage>
  );
}
