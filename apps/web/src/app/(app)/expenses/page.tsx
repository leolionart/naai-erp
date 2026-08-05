import { ModulePage } from "@/components/layout/module-page";
import { ModuleWorkspace } from "../../module-workspace";

export default function ExpensesPage() {
  return (
    <ModulePage
      title="Chi phí"
      section="Tài chính"
      description="Ghi nhận chi phí có hoặc không hóa đơn, hoàn ứng và review thuế độc lập."
    >
      <ModuleWorkspace moduleKey="expenses" />
    </ModulePage>
  );
}
