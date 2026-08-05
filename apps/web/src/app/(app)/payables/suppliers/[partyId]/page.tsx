import { Suspense } from "react";
import { ModulePage } from "@/components/layout/module-page";
import { Skeleton } from "@/components/ui/skeleton";
import { AgingPartyWorkspace } from "../../../../workspaces/aging-party-workspace";

export default async function SupplierAgingPage({
  params,
}: Readonly<{ params: Promise<{ partyId: string }> }>) {
  const { partyId } = await params;
  return (
    <ModulePage
      title="Chi tiết công nợ nhà cung cấp"
      section="Công nợ phải trả"
      description="Open items, advance/credit, allocation và đường dẫn kiểm toán của một nhà cung cấp."
    >
      <Suspense
        fallback={<Skeleton className="h-80 w-full" aria-label="Đang tải chi tiết phải trả" />}
      >
        <AgingPartyWorkspace side="ap" partyId={partyId} />
      </Suspense>
    </ModulePage>
  );
}
