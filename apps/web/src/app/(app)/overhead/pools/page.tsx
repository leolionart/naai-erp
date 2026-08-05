import { Suspense } from "react";
import { ModulePage } from "@/components/layout/module-page";
import { Skeleton } from "@/components/ui/skeleton";
import { OverheadQueueWorkspace } from "../../../workspaces/overhead-workspaces";
export default function Page() {
  return (
    <ModulePage
      title="Overhead source pools"
      section="Chi phí dự án"
      description="Claim overhead-reserved sources theo period và policy."
    >
      <Suspense fallback={<Skeleton className="h-80 w-full" />}>
        <OverheadQueueWorkspace kind="pools" />
      </Suspense>
    </ModulePage>
  );
}
