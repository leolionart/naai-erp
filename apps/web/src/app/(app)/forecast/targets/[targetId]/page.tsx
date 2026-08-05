import { ModulePage } from "@/components/layout/module-page";
import { PlanningDetailWorkspace } from "../../../../workspaces/planning-workspaces";
export default async function Page({ params }: { params: Promise<{ targetId: string }> }) {
  const { targetId } = await params;
  return (
    <ModulePage
      title="Target version"
      section="Kế hoạch"
      description="Review và lifecycle của một target version."
    >
      <PlanningDetailWorkspace kind="targets" id={targetId} />
    </ModulePage>
  );
}
