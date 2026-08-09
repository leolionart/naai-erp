import { ModulePage } from "@/components/layout/module-page";
import { BusinessRecordWorkspace } from "../../../workspaces/business-directory-workspace";

export default async function CustomerPage({
  params,
}: Readonly<{ params: Promise<{ partyId: string }> }>) {
  const { partyId } = await params;
  return (
    <ModulePage
      title="Hồ sơ khách hàng"
      section="Khách hàng"
      sectionHref="/customers"
      description="Thông tin khách hàng và đường dẫn sang công nợ phải thu."
    >
      <BusinessRecordWorkspace kind="customers" id={partyId} />
    </ModulePage>
  );
}
