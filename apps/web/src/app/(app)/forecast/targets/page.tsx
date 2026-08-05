import { Suspense } from "react";
import { ModulePage } from "@/components/layout/module-page";
import { Skeleton } from "@/components/ui/skeleton";
import { PlanningQueueWorkspace } from "../../../workspaces/planning-workspaces";
export default function Page() {
  return (
    <ModulePage
      title="Revenue targets"
      section="Kế hoạch"
      description="Target tháng, quý, năm với actual basis rõ ràng."
    >
      <Suspense fallback={<Skeleton className="h-80 w-full" />}>
        <PlanningQueueWorkspace kind="targets" />
      </Suspense>
    </ModulePage>
  );
}
