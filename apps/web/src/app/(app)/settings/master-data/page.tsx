import { ModulePage } from "@/components/layout/module-page";
import { LedgerMasterWorkspace } from "../../../workspaces/ledger-master-workspace";

export default function MasterDataPage() {
  return (
    <ModulePage
      title="Dữ liệu nền"
      section="Thiết lập"
      description="Hệ thống tài khoản, kỳ tài chính, dimensions, parties và dự án."
    >
      <LedgerMasterWorkspace initialSection="accounts" />
    </ModulePage>
  );
}
