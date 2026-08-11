import { AutomationApiDialog } from "@/components/automation-api-dialog";
import { ModulePage } from "@/components/layout/module-page";
import { PurchaseProductWorkspace } from "../../../workspaces/purchase-product-workspace";

export default function PurchaseProductsPage() {
  return (
    <ModulePage
      title="Sản phẩm mua vào & VAT"
      section="Thiết lập"
      description="Quản lý danh mục sản phẩm mua vào với mức VAT mặc định 8% hoặc 10%."
      actions={<AutomationApiDialog resources={["purchase-products"]} />}
    >
      <PurchaseProductWorkspace />
    </ModulePage>
  );
}
