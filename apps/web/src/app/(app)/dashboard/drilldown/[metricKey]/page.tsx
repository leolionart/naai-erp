import { Suspense } from "react";
import { DashboardMetricDrilldownWorkspace } from "@/app/workspaces/dashboard-workspaces";
import { Skeleton } from "@/components/ui/skeleton";

export default async function Page({ params }: { params: Promise<{ metricKey: string }> }) {
  const { metricKey } = await params;
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <DashboardMetricDrilldownWorkspace metricKey={metricKey} />
    </Suspense>
  );
}
