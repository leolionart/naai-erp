import type { Metadata } from "next";
import { ModulePage } from "@/components/layout/module-page";
import { OwnerCurrentWorkspace } from "../../../workspaces/owner-current-workspace";

export const metadata: Metadata = { title: "Đối chiếu công nợ chủ | NAAI ERP" };

export default function OwnerCurrentPage() {
  return (
    <ModulePage
      title="Đối chiếu công nợ chủ"
      section="Tiền mặt & Ngân hàng"
      sectionHref="/banking"
      description="Kiểm tra từng bút toán làm tăng hoặc giảm số tiền công ty đang nợ chủ doanh nghiệp."
    >
      <OwnerCurrentWorkspace />
    </ModulePage>
  );
}
