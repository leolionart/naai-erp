import { Suspense } from "react";
import { ModulePage } from "@/components/layout/module-page";
import { Skeleton } from "@/components/ui/skeleton";
import { ProjectCostsWorkspace } from "../../../../workspaces/project-cost-workspaces";
export default async function Page({
  params,
}: Readonly<{ params: Promise<{ projectId: string }> }>) {
  const { projectId } = await params;
  return (
    <ModulePage
      title="Chi phí dự án"
      section="Dự án"
      description="Ledger-backed và management labor cost được trình bày tách biệt."
    >
      <Suspense fallback={<Skeleton className="h-80 w-full" />}>
        <ProjectCostsWorkspace projectId={projectId} />
      </Suspense>
    </ModulePage>
  );
}
