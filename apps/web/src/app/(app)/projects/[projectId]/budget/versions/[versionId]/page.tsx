import { ModulePage } from "@/components/layout/module-page";
import { ResourceDetailWorkspace } from "../../../../../../workspaces/project-revenue-workspaces";
export default async function Page({
  params,
}: Readonly<{ params: Promise<{ projectId: string; versionId: string }> }>) {
  const { projectId, versionId } = await params;
  return (
    <ModulePage
      title="Budget version"
      section="Project budget"
      description="Version detail và lifecycle approval/supersede."
    >
      <ResourceDetailWorkspace
        kind="budget"
        id={`projects/${projectId}/budget-versions/${versionId}`}
      />
    </ModulePage>
  );
}
