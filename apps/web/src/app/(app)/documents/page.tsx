import { Suspense } from "react";
import { ModulePage } from "@/components/layout/module-page";
import { Skeleton } from "@/components/ui/skeleton";
import { FocusedRecordListWorkspace } from "../../workspaces/focused-record-workspaces";

export default function DocumentsPage() {
  return (
    <ModulePage
      title="Hóa đơn"
      section="Tài chính"
      description="Quản lý hóa đơn đầu ra, đầu vào và credit note với lifecycle được kiểm soát."
    >
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <FocusedRecordListWorkspace kind="documents" />
      </Suspense>
    </ModulePage>
  );
}
