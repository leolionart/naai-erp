import { Suspense } from "react";
import { ModulePage } from "@/components/layout/module-page";
import { Skeleton } from "@/components/ui/skeleton";
import { OverheadQueueWorkspace } from "../../../workspaces/overhead-workspaces";
export default function Page() {
  return (
    <ModulePage
      title="Overhead allocation runs"
      section="Chi phí dự án"
      description="Deterministic basis snapshot, approval, posting và reversal."
    >
      <Suspense fallback={<Skeleton className="h-80 w-full" />}>
        <OverheadQueueWorkspace kind="runs" />
      </Suspense>
    </ModulePage>
  );
}
