import { ModulePage } from "@/components/layout/module-page";
import { InternalTransferListWorkspace } from "../../../workspaces/internal-transfer-list-workspace";

export default function InternalTransfersPage() {
  return (
    <ModulePage
      title="Chuyển tiền nội bộ"
      section="Tiền mặt & Ngân hàng"
      sectionHref="/banking"
      description="Ghép các chiều chuyển giữa tài khoản sở hữu nội bộ mà không làm phát sinh doanh thu hoặc chi phí principal."
    >
      <InternalTransferListWorkspace />
    </ModulePage>
  );
}
