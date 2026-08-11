import { Suspense } from "react";
import { ModulePage } from "@/components/layout/module-page";
import { Skeleton } from "@/components/ui/skeleton";
import { ProjectFreelancePayablesWorkspace } from "../../workspaces/project-freelance-payables-workspace";

function QueueFallback() {
  return <Skeleton className="h-80 w-full" aria-label="Đang tải công nợ phải trả" />;
}

export default function PayablesPage() {
  return (
    <ModulePage
      title="Công nợ phải trả"
      description="Theo dõi các chi phí freelance thực tế còn phải trả. Hóa đơn đầu vào thông thường mặc định đã được tất toán theo nguồn thanh toán đã ghi nhận."
    >
      <Suspense fallback={<QueueFallback />}>
        <ProjectFreelancePayablesWorkspace />
      </Suspense>
    </ModulePage>
  );
}
