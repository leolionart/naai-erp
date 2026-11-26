import { Suspense } from "react";
import { ModulePage } from "@/components/layout/module-page";
import { PeriodCloseWorkspace } from "../../../workspaces/period-close-workspace";

export default function PeriodClosePage() {
  return (
    <ModulePage
      title="Đóng sổ hàng tháng, kiểm quỹ & quyết toán cuối năm"
      description="Kiểm tra 6 tiêu chí trước khi khóa kỳ, lập biên bản kiểm quỹ 111-OWNER-CUSTODY và quyết toán vị thế chủ doanh nghiệp (3388 / 1388 / 421)."
      section="Sổ cái kế toán"
    >
      <Suspense fallback={null}>
        <PeriodCloseWorkspace />
      </Suspense>
    </ModulePage>
  );
}
