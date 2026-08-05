import { ModulePage } from "@/components/layout/module-page";
import { RevenueRecognitionQueueWorkspace } from "../../workspaces/project-revenue-workspaces";
export default function Page() {
  return (
    <ModulePage
      title="Revenue recognition"
      section="Dự án"
      description="Milestone evidence và recognition events theo policy."
    >
      <RevenueRecognitionQueueWorkspace />
    </ModulePage>
  );
}
