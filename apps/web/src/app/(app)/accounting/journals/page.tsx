import { ModulePage } from "@/components/layout/module-page";
import { LedgerMasterWorkspace } from "../../../workspaces/ledger-master-workspace";

export default function JournalsPage() {
  return (
    <ModulePage
      title="Sổ kế toán"
      description="Tạo, duyệt, ghi sổ, đảo bút toán và xem báo cáo sổ cái."
    >
      <LedgerMasterWorkspace
        initialSection="journals"
        allowedSections={["journals", "reports"]}
        title="Bút toán & Báo cáo"
        description="Quản lý lịch sử hạch toán kế toán, lên sổ nhật ký chung và báo cáo sổ cái."
      />
    </ModulePage>
  );
}
