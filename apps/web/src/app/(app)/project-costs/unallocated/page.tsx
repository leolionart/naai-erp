import { ModulePage } from "@/components/layout/module-page";
import { UnallocatedCostsWorkspace } from "../../../workspaces/project-cost-workspaces";
export default function Page() {
  return (
    <ModulePage
      title="Nguồn chi phí chưa phân bổ"
      section="Chi phí dự án"
      description="Tạo draft direct-cost allocation từ nguồn ledger còn available."
    >
      <UnallocatedCostsWorkspace />
    </ModulePage>
  );
}
