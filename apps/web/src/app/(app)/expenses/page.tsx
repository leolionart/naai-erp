import { Suspense } from "react";
import { ModulePage } from "@/components/layout/module-page";
import { Skeleton } from "@/components/ui/skeleton";
import { FocusedRecordListWorkspace } from "../../workspaces/focused-record-workspaces";

export default function ExpensesPage() {
  return (
    <ModulePage
      title="Chi phí"
      section="Tài chính"
      description="Ghi nhận chi phí có hoặc không hóa đơn, hoàn ứng và review thuế độc lập."
    >
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <FocusedRecordListWorkspace kind="expenses" />
      </Suspense>
    </ModulePage>
  );
}
