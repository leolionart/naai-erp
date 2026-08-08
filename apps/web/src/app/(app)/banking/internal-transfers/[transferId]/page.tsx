import { ModulePage } from "@/components/layout/module-page";
import { InternalTransferWorkspace } from "../../../../workspaces/internal-transfer-workspace";

export default async function InternalTransferPage({
  params,
}: Readonly<{ params: Promise<{ transferId: string }> }>) {
  const { transferId } = await params;
  return (
    <ModulePage
      title="Chi tiết chuyển tiền nội bộ"
      section="Chuyển tiền nội bộ"
      sectionHref="/banking/internal-transfers"
      description="Kiểm tra hai chiều giao dịch, transit, phí riêng và journal readback trước khi ghép hoặc hủy ghép."
    >
      <InternalTransferWorkspace transferId={transferId} />
    </ModulePage>
  );
}
