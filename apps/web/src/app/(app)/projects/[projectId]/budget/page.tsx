import { Suspense } from "react";
import { ModulePage } from "@/components/layout/module-page";
import { Skeleton } from "@/components/ui/skeleton";
import { ProjectBudgetWorkspace } from "../../../../workspaces/project-revenue-workspaces";
export default async function Page({
  params,
}: Readonly<{ params: Promise<{ projectId: string }> }>) {
  const { projectId } = await params;
  return (
    <ModulePage
      title="Project budget & revenue"
      section="Dự án"
      description="Budget versions và revenue axes recognized, invoiced, collected."
    >
      <Suspense fallback={<Skeleton className="h-80 w-full" />}>
        <ProjectBudgetWorkspace projectId={projectId} />
      </Suspense>
    </ModulePage>
  );
}
