import { Suspense } from "react";
import { ModulePage } from "@/components/layout/module-page";
import { Skeleton } from "@/components/ui/skeleton";
import { PerformanceComparisonDetailWorkspace } from "../../../../workspaces/performance-comparison-workspaces";

export default async function Page({ params }: { params: Promise<{ periodId: string }> }) {
  const { periodId } = await params;
  return (
    <ModulePage
      title={`Chi tiết hiệu suất ${periodId}`}
      section="Kế hoạch"
      description="Công thức, trạng thái N/A và nguồn của từng phép so sánh trong kỳ."
    >
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <PerformanceComparisonDetailWorkspace periodId={periodId} />
      </Suspense>
    </ModulePage>
  );
}
