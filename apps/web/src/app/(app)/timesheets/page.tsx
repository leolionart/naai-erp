import { Suspense } from "react";
import { ModulePage } from "@/components/layout/module-page";
import { Skeleton } from "@/components/ui/skeleton";
import { TimesheetQueueWorkspace } from "../../workspaces/timesheet-workspaces";
export default function Page() {
  return (
    <ModulePage
      title="Timesheets"
      section="Vận hành"
      description="Theo dõi thời gian, billable classification và availability theo tuần."
    >
      <Suspense fallback={<Skeleton className="h-80 w-full" />}>
        <TimesheetQueueWorkspace />
      </Suspense>
    </ModulePage>
  );
}
