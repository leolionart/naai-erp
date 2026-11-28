import { AutomationApiReferenceSection } from "@/components/automation-api-dialog";
import { ModulePage } from "@/components/layout/module-page";
import { IntegrationAutoRecordSection } from "@/app/workspaces/integration-settings-workspace";

export default function AutomationSettingsPage() {
  return (
    <ModulePage
      title="Nguồn tích hợp & Tự động ghi sổ"
      section="Cấu hình & Vận hành"
      description="Quản lý cờ tự động ghi sổ (autoRecord) cho token tích hợp, nguồn webhook đầu vào và tài liệu REST API."
    >
      <div className="flex flex-col gap-6">
        <IntegrationAutoRecordSection />
        <AutomationApiReferenceSection />
      </div>
    </ModulePage>
  );
}
