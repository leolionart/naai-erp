import { ModulePage } from "@/components/layout/module-page";
import { ScopeChangeQueueWorkspace } from "../../workspaces/project-revenue-workspaces";
export default function Page() {
  return (
    <ModulePage
      title="Scope changes"
      section="Dự án"
      description="Revenue/cost delta không rewrite approved budget."
    >
      <ScopeChangeQueueWorkspace />
    </ModulePage>
  );
}
