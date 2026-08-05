import { Suspense } from "react";
import { ModulePage } from "@/components/layout/module-page";
import { Skeleton } from "@/components/ui/skeleton";
import { ProjectProfitabilityDetailWorkspace } from "../../../../../workspaces/project-profitability-workspaces";

export default async function Page({
  params,
}: Readonly<{ params: Promise<{ projectId: string }> }>) {
  const { projectId } = await params;
  return (
    <ModulePage
      title="Profitability drill-down"
      section="Project profitability"
      description="Nguồn revenue, direct cost, overhead allocation và kiểm soát độ tin cậy."
    >
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <ProjectProfitabilityDetailWorkspace projectId={projectId} />
      </Suspense>
    </ModulePage>
  );
}
