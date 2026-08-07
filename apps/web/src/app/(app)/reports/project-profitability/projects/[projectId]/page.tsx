import { Suspense } from "react";
import { ModulePage } from "@/components/layout/module-page";
import { Skeleton } from "@/components/ui/skeleton";
import { ProjectProfitabilityDetailWorkspace } from "../../../../../workspaces/project-profitability-workspaces";

export default async function Page({
  params,
}: Readonly<{ params: Promise<{ projectId: string }> }>) {
  const { projectId } = await params;
  return (
    <ModulePage
      title="Phân tích lợi nhuận dự án"
      section="Báo cáo lợi nhuận"
      sectionHref="/reports/project-profitability"
      description="Chi tiết doanh thu, chi phí trực tiếp và phân bổ chi phí gián tiếp theo dự án."
    >
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <ProjectProfitabilityDetailWorkspace projectId={projectId} />
      </Suspense>
    </ModulePage>
  );
}
