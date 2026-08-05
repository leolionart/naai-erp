import { ModulePage } from "@/components/layout/module-page";
import { ModuleWorkspace } from "../../module-workspace";

export default function DocumentsPage() {
  return (
    <ModulePage
      title="Hóa đơn"
      section="Tài chính"
      description="Quản lý hóa đơn đầu ra, đầu vào và credit note với lifecycle được kiểm soát."
    >
      <ModuleWorkspace moduleKey="documents" />
    </ModulePage>
  );
}
