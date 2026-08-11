import { AutomationApiDialog } from "@/components/automation-api-dialog";
import { ModulePage } from "@/components/layout/module-page";
import { BusinessDirectoryWorkspace } from "../../workspaces/business-directory-workspace";

export default function ProjectsPage() {
  return (
    <ModulePage
      title="Dự án"
      description="Dự án liên kết khách hàng, hóa đơn, ngân sách, chi phí và lợi nhuận."
      actions={<AutomationApiDialog resources={["projects"]} />}
    >
      <BusinessDirectoryWorkspace kind="projects" />
    </ModulePage>
  );
}
