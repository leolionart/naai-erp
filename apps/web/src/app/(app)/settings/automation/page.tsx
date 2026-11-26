import { ModulePage } from "@/components/layout/module-page";
import { IntegrationAutoRecordSection } from "@/app/workspaces/integration-settings-workspace";

export default function AutomationSettingsPage() {
  return (
    <ModulePage
      title="Nguồn tích hợp & Tự động ghi sổ"
      section="Cấu hình & Vận hành"
      description="Quản lý cờ tự động ghi sổ (autoRecord) cho token tích hợp và nguồn webhook đầu vào."
    >
      <IntegrationAutoRecordSection />
    </ModulePage>
  );
}
