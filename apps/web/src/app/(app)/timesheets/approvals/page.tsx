import { Suspense } from "react";
import { ModulePage } from "@/components/layout/module-page";
import { Skeleton } from "@/components/ui/skeleton";
import { TimesheetQueueWorkspace } from "../../../workspaces/timesheet-workspaces";
export default function Page() {
  return (
    <ModulePage
      title="Duyệt timesheet"
      section="Timesheets"
      description="Queue riêng cho maker-checker approval."
    >
      <Suspense fallback={<Skeleton className="h-80 w-full" />}>
        <TimesheetQueueWorkspace approvals />
      </Suspense>
    </ModulePage>
  );
}
