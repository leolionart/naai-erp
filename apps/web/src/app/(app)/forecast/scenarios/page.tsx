import { Suspense } from "react";
import { ModulePage } from "@/components/layout/module-page";
import { Skeleton } from "@/components/ui/skeleton";
import { PlanningQueueWorkspace } from "../../../workspaces/planning-workspaces";
export default function Page() {
  return (
    <ModulePage
      title="Forecast scenarios"
      section="Kế hoạch"
      description="Version base, best, worst, custom và month-end snapshots."
    >
      <Suspense fallback={<Skeleton className="h-80 w-full" />}>
        <PlanningQueueWorkspace kind="forecasts" />
      </Suspense>
    </ModulePage>
  );
}
