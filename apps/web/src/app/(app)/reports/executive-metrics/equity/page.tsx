import { Suspense } from "react";
import { ExecutiveMetricWorkspace } from "@/app/workspaces/executive-metrics-workspaces";
import { Skeleton } from "@/components/ui/skeleton";
export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <ExecutiveMetricWorkspace kind="equity" />
    </Suspense>
  );
}
