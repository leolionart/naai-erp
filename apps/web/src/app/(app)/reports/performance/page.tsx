import { Suspense } from "react";
import { ModulePage } from "@/components/layout/module-page";
import { Skeleton } from "@/components/ui/skeleton";
import { PerformanceComparisonQueueWorkspace } from "../../../workspaces/performance-comparison-workspaces";

export default function Page() {
  return (
    <ModulePage
      title="Hiệu suất kế hoạch"
      section="Kế hoạch"
      description="Actual vs target, MoM, YoY và forecast variance theo đúng actual basis đã chọn."
    >
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <PerformanceComparisonQueueWorkspace />
      </Suspense>
    </ModulePage>
  );
}
