import { Suspense } from "react";
import { ModulePage } from "@/components/layout/module-page";
import { Skeleton } from "@/components/ui/skeleton";
import { ProjectProfitabilityQueueWorkspace } from "../../../workspaces/project-profitability-workspaces";

export default function Page() {
  return (
    <ModulePage
      title="Project profitability"
      section="Báo cáo quản trị"
      description="Gross margin, contribution margin, fully loaded profit và confidence flags theo dự án."
    >
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <ProjectProfitabilityQueueWorkspace />
      </Suspense>
    </ModulePage>
  );
}
