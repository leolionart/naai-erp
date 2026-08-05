import { ModulePage } from "@/components/layout/module-page";
import { BankingWorkspace } from "../../workspaces/banking-workspace";

export default function BankingPage() {
  return (
    <ModulePage
      title="Ngân hàng & tiền mặt"
      section="Tài chính"
      description="Quản lý tài khoản tiền, nhập sao kê CSV và kiểm soát giao dịch trùng lặp."
    >
      <BankingWorkspace />
    </ModulePage>
  );
}
