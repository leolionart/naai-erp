import { Suspense } from "react";
import { AutomationApiDialog } from "@/components/automation-api-dialog";
import { ModulePage } from "@/components/layout/module-page";
import { Skeleton } from "@/components/ui/skeleton";
import { CustomerSubscriptionWorkspace } from "../../workspaces/customer-subscription-workspace";

export default function SubscriptionsPage() {
  return (
    <ModulePage
      title="Dịch vụ định kỳ của khách hàng"
      section="Kinh doanh"
      description="Theo dõi dịch vụ khách hàng đã và đang sử dụng, kỳ tính phí kế tiếp và giá trị định kỳ dự kiến."
      actions={<AutomationApiDialog resources={["subscriptions"]} />}
    >
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <CustomerSubscriptionWorkspace />
      </Suspense>
    </ModulePage>
  );
}
