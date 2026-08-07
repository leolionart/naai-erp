import { Suspense } from "react";
import { ModulePage } from "@/components/layout/module-page";
import { Skeleton } from "@/components/ui/skeleton";
import { AgingQueueWorkspace } from "../../workspaces/aging-queue-workspace";

function QueueFallback() {
  return <Skeleton className="h-80 w-full" aria-label="Đang tải công nợ phải thu" />;
}

export default function ReceivablesPage() {
  return (
    <ModulePage
      title="Công nợ phải thu"
      description="Theo dõi tuổi nợ khách hàng, credit riêng biệt và đối chiếu AR về sổ cái tại ngày báo cáo."
    >
      <Suspense fallback={<QueueFallback />}>
        <AgingQueueWorkspace side="ar" />
      </Suspense>
    </ModulePage>
  );
}
