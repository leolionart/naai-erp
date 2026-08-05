import { ModulePage } from "@/components/layout/module-page";
import { CostRateListWorkspace } from "../../../workspaces/cost-rate-workspaces";
export default function Page() {
  return (
    <ModulePage
      title="Chi phí nhân sự"
      section="Dữ liệu nền"
      description="Quản trị effective labor cost rates có kiểm soát truy cập."
    >
      <CostRateListWorkspace />
    </ModulePage>
  );
}
