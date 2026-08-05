import { Suspense } from "react";
import { ModulePage } from "@/components/layout/module-page";
import { Skeleton } from "@/components/ui/skeleton";
import { AgingPartyWorkspace } from "../../../../workspaces/aging-party-workspace";

export default async function CustomerAgingPage({
  params,
}: Readonly<{ params: Promise<{ partyId: string }> }>) {
  const { partyId } = await params;
  return (
    <ModulePage
      title="Chi tiết công nợ khách hàng"
      section="Công nợ phải thu"
      description="Open items, credit, allocation và đường dẫn kiểm toán của một khách hàng tại ngày báo cáo."
    >
      <Suspense
        fallback={<Skeleton className="h-80 w-full" aria-label="Đang tải chi tiết phải thu" />}
      >
        <AgingPartyWorkspace side="ar" partyId={partyId} />
      </Suspense>
    </ModulePage>
  );
}
