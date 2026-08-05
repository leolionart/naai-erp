import { ModulePage } from "@/components/layout/module-page";
import { DirectCostAllocationWorkspace } from "../../../workspaces/project-cost-workspaces";
export default async function Page({
  params,
}: Readonly<{ params: Promise<{ allocationId: string }> }>) {
  const { allocationId } = await params;
  return (
    <ModulePage
      title="Direct-cost allocation"
      section="Chi phí dự án"
      description="Lifecycle submit, approve, post và reverse có audit."
    >
      <DirectCostAllocationWorkspace allocationId={allocationId} />
    </ModulePage>
  );
}
