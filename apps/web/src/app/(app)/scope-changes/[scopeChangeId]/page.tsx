import { ModulePage } from "@/components/layout/module-page";
import { ResourceDetailWorkspace } from "../../../workspaces/project-revenue-workspaces";
export default async function Page({
  params,
}: Readonly<{ params: Promise<{ scopeChangeId: string }> }>) {
  const { scopeChangeId } = await params;
  return (
    <ModulePage
      title="Scope-change detail"
      section="Scope changes"
      description="Review delta và lifecycle audit."
    >
      <ResourceDetailWorkspace kind="scope" id={scopeChangeId} />
    </ModulePage>
  );
}
