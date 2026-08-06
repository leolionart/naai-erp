import { Suspense } from "react";
import { FinanceReviewWorkspace } from "@/app/workspaces/dashboard-workspaces";
import { Skeleton } from "@/components/ui/skeleton";

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <FinanceReviewWorkspace />
    </Suspense>
  );
}
