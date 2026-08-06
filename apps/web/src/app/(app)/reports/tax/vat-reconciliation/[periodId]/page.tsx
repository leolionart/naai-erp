import { Suspense } from "react";
import { ModulePage } from "@/components/layout/module-page";
import { Skeleton } from "@/components/ui/skeleton";
import { FinancialStatementWorkspace } from "@/app/workspaces/financial-statement-workspaces";

export default async function Page({ params }: { params: Promise<{ periodId: string }> }) {
  const { periodId } = await params;
  return (
    <ModulePage
      title="Đối soát VAT"
      section="Thuế"
      description="VAT đầu ra, đầu vào, đủ điều kiện, không đủ điều kiện và hồ sơ chưa đối soát."
    >
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <FinancialStatementWorkspace kind="vat_reconciliation" routeValue={periodId} />
      </Suspense>
    </ModulePage>
  );
}
