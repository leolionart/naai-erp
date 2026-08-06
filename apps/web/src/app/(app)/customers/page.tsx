import { ModulePage } from "@/components/layout/module-page";
import { BusinessDirectoryWorkspace } from "../../workspaces/business-directory-workspace";

export default function CustomersPage() {
  return (
    <ModulePage
      title="Khách hàng"
      section="Điều hành"
      description="Hồ sơ khách hàng liên kết với hóa đơn đầu ra và công nợ phải thu."
    >
      <BusinessDirectoryWorkspace kind="customers" />
    </ModulePage>
  );
}
