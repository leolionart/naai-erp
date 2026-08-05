import { ModulePage } from "@/components/layout/module-page";
import { ReconciliationWorkspace } from "../../../../workspaces/reconciliation-workspace";

export default async function ReconciliationPage({
  params,
}: Readonly<{ params: Promise<{ transactionId: string }> }>) {
  const { transactionId } = await params;
  return (
    <ModulePage
      title="Đối soát giao dịch"
      section="Ngân hàng & tiền mặt"
      description="Đánh giá candidate, phân bổ thanh toán và kiểm tra bút toán trước khi đối soát."
    >
      <ReconciliationWorkspace transactionId={transactionId} />
    </ModulePage>
  );
}
