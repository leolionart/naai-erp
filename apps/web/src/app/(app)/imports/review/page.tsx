import { ModulePage } from "@/components/layout/module-page";
import { ImportReviewWorkspace } from "@/app/workspaces/import-review-workspace";

export default function ImportReviewPage() {
  return (
    <ModulePage
      title="Dữ liệu cần bổ sung"
      section="Dữ liệu"
      description="Rà soát từng dòng workbook còn thiếu khách hàng, dự án, nhà cung cấp hoặc phân loại trước khi dùng làm dữ liệu chuẩn."
    >
      <ImportReviewWorkspace />
    </ModulePage>
  );
}
