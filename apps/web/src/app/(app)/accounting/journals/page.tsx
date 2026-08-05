import { ModulePage } from "@/components/layout/module-page";
import { LedgerMasterWorkspace } from "../../../workspaces/ledger-master-workspace";

export default function JournalsPage() {
  return (
    <ModulePage
      title="Sổ kế toán"
      section="Kế toán"
      description="Tạo, duyệt, ghi sổ, đảo bút toán và xem báo cáo sổ cái."
    >
      <LedgerMasterWorkspace initialSection="journals" />
    </ModulePage>
  );
}
