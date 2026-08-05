import { Suspense } from "react";
import { ModulePage } from "@/components/layout/module-page";
import { Skeleton } from "@/components/ui/skeleton";
import { StatementSessionListWorkspace } from "../../../workspaces/statement-session-list-workspace";

export default function StatementSessionsPage() {
  return (
    <ModulePage
      title="Kiểm soát sao kê"
      section="Ngân hàng & tiền mặt"
      description="Kiểm soát opening/closing balance, import coverage và exception trước khi đóng kỳ sao kê."
    >
      <Suspense fallback={<Skeleton className="h-80 w-full" aria-label="Đang tải kỳ sao kê" />}>
        <StatementSessionListWorkspace />
      </Suspense>
    </ModulePage>
  );
}
