import { ModulePage } from "@/components/layout/module-page";
import { OverheadRunWorkspace } from "../../../../workspaces/overhead-workspaces";
export default async function Page({ params }: Readonly<{ params: Promise<{ runId: string }> }>) {
  const { runId } = await params;
  return (
    <ModulePage
      title="Overhead run detail"
      section="Phân bổ overhead"
      description="Basis, splits, maker-checker và posting lifecycle."
    >
      <OverheadRunWorkspace runId={runId} />
    </ModulePage>
  );
}
