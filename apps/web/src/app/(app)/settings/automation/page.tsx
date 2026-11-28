import { AiNativeDiscoveryCard } from "@/components/automation-api-dialog";
import { ModulePage } from "@/components/layout/module-page";
import { IntegrationAutoRecordSection } from "@/app/workspaces/integration-settings-workspace";

export default function AutomationSettingsPage() {
  return (
    <ModulePage
      title="Kết nối tích hợp & Khóa dịch vụ"
      section="Cấu hình & Vận hành"
      description="Quản lý Khóa kết nối dịch vụ (AI, CLI, n8n), Nguồn Webhook đầu vào và cấu hình tự động ghi sổ tách biệt hoàn toàn với phiên đăng nhập của chủ sở hữu."
    >
      <div className="flex flex-col gap-6">
        <IntegrationAutoRecordSection />
        <AiNativeDiscoveryCard />
      </div>
    </ModulePage>
  );
}
