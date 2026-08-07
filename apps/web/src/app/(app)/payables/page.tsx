import { Suspense } from "react";
import { ModulePage } from "@/components/layout/module-page";
import { Skeleton } from "@/components/ui/skeleton";
import { AgingQueueWorkspace } from "../../workspaces/aging-queue-workspace";

function QueueFallback() {
  return <Skeleton className="h-80 w-full" aria-label="Đang tải công nợ phải trả" />;
}

export default function PayablesPage() {
  return (
    <ModulePage
      title="Công nợ phải trả"
      description="Theo dõi hạn thanh toán nhà cung cấp, advance/credit riêng biệt và đối chiếu AP về sổ cái."
    >
      <Suspense fallback={<QueueFallback />}>
        <AgingQueueWorkspace side="ap" />
      </Suspense>
    </ModulePage>
  );
}
