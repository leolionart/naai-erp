import { Suspense } from "react";
import { ModulePage } from "@/components/layout/module-page";
import { Skeleton } from "@/components/ui/skeleton";
import { OverheadQueueWorkspace } from "../../../workspaces/overhead-workspaces";
export default function Page() {
  return (
    <ModulePage
      title="Overhead policies"
      section="Chi phí dự án"
      description="Versioned allocation methods và effective dates."
    >
      <Suspense fallback={<Skeleton className="h-80 w-full" />}>
        <OverheadQueueWorkspace kind="policies" />
      </Suspense>
    </ModulePage>
  );
}
