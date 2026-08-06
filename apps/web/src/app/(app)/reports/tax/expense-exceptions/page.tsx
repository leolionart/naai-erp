import { Suspense } from "react";
import { ModulePage } from "@/components/layout/module-page";
import { Skeleton } from "@/components/ui/skeleton";
import { TaxExpenseExceptionsWorkspace } from "@/app/workspaces/financial-statement-workspaces";

export default function Page() {
  return (
    <ModulePage
      title="Chi phí cần rà soát thuế"
      section="Thuế"
      description="Accounting booked, CIT deductible và VAT eligible được đọc như ba trạng thái độc lập."
    >
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <TaxExpenseExceptionsWorkspace />
      </Suspense>
    </ModulePage>
  );
}
