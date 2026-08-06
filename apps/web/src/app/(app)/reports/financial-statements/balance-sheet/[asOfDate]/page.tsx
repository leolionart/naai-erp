import { Suspense } from "react";
import { ModulePage } from "@/components/layout/module-page";
import { Skeleton } from "@/components/ui/skeleton";
import { FinancialStatementWorkspace } from "@/app/workspaces/financial-statement-workspaces";

export default function Page() {
  return (
    <ModulePage
      title="Bảng cân đối kế toán"
      section="Báo cáo tài chính"
      description="Assets = Liabilities + Equity; mọi chênh lệch đều chặn trạng thái final."
    >
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <FinancialStatementWorkspace kind="balance_sheet" />
      </Suspense>
    </ModulePage>
  );
}
