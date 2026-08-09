import { ModulePage } from "@/components/layout/module-page";
import { LedgerMasterWorkspace } from "../../../workspaces/ledger-master-workspace";
import { ExpenseCategoryPolicyWorkspace } from "../../../workspaces/expense-category-policy-workspace";
import { BusinessModeWorkspace } from "../../../workspaces/business-mode-workspace";

export default function MasterDataPage() {
  return (
    <ModulePage
      title="Dữ liệu nền"
      section="Thiết lập"
      description="Hệ thống tài khoản, kỳ tài chính, dimensions, parties và dự án."
    >
      <div className="flex flex-col gap-6">
        <BusinessModeWorkspace />
        <ExpenseCategoryPolicyWorkspace />
        <LedgerMasterWorkspace
          initialSection="accounts"
          allowedSections={["accounts", "resources"]}
          title="Quản lý Dữ liệu nền"
          description="Định nghĩa hệ thống tài khoản (COA), danh sách dự án, khách hàng và các cấu hình cốt lõi khác."
        />
      </div>
    </ModulePage>
  );
}
