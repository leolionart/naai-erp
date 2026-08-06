import { Suspense } from "react";
import { ModulePage } from "@/components/layout/module-page";
import { Skeleton } from "@/components/ui/skeleton";
import { FinancialStatementWorkspace } from "@/app/workspaces/financial-statement-workspaces";

export default function Page() {
  return (
    <ModulePage
      title="Lưu chuyển tiền tệ trực tiếp"
      section="Báo cáo tài chính"
      description="Operating, investing và financing; opening cash cộng net movement phải bằng closing cash."
    >
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <FinancialStatementWorkspace kind="cash_flow" />
      </Suspense>
    </ModulePage>
  );
}
