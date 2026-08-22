import { OperationalLogWorkspace } from "@/app/workspaces/background-activity-workspace";
import { ModulePage } from "@/components/layout/module-page";

export default function BackgroundActivitiesPage() {
  return (
    <ModulePage
      title="Nhật ký chạy ngầm"
      section="Vận hành hệ thống"
      description="Xem trạng thái và lỗi của các hoạt động hệ thống xử lý ở chế độ nền."
    >
      <OperationalLogWorkspace />
    </ModulePage>
  );
}
