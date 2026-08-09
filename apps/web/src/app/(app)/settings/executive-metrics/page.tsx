import { ModulePage } from "@/components/layout/module-page";
import { ExecutiveMetricSettingsWorkspace } from "../../../workspaces/executive-metric-settings-workspace";

export default function ExecutiveMetricSettingsPage() {
  return (
    <ModulePage
      title="Cấu hình chỉ số điều hành"
      section="Thiết lập"
      description="Quản lý policy, nguồn tài khoản và phạm vi hiệu lực dùng để tính chỉ số từ ledger."
    >
      <ExecutiveMetricSettingsWorkspace />
    </ModulePage>
  );
}
