import { ModulePage } from "@/components/layout/module-page";
import { MilestoneAcceptanceWorkspace } from "../../workspaces/project-revenue-workspaces";
export default function Page() {
  return (
    <ModulePage
      title="Milestone acceptances"
      section="Revenue recognition"
      description="Acceptance evidence trước khi recognition."
    >
      <MilestoneAcceptanceWorkspace />
    </ModulePage>
  );
}
