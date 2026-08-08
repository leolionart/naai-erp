import type { Metadata } from "next";
import { ModulePage } from "@/components/layout/module-page";
import { BankingWorkspace } from "../../workspaces/banking-workspace";

export const metadata: Metadata = {
  title: "Tài khoản & Giao dịch | NAAI ERP",
};

export default function BankingPage() {
  return (
    <ModulePage
      title="Tài khoản & Giao dịch"
      section="Tiền mặt & Ngân hàng"
      sectionHref="/banking"
      description="Quản lý tài khoản ngân hàng, quỹ tiền mặt, lịch sử nộp/rút và giao dịch chờ đối soát."
    >
      <BankingWorkspace />
    </ModulePage>
  );
}
