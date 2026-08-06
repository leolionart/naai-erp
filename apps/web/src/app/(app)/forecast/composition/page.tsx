import { ModulePage } from "@/components/layout/module-page";
import { ForecastCompositionQueueWorkspace } from "@/app/workspaces/forecast-composition-workspace";

export default function Page() {
  return (
    <ModulePage
      title="Dự báo doanh thu & dòng tiền"
      section="Kế hoạch"
      description="Quản lý nguồn dự báo, xác suất pipeline, chi phí và projected closing cash theo từng forecast version."
    >
      <ForecastCompositionQueueWorkspace />
    </ModulePage>
  );
}
