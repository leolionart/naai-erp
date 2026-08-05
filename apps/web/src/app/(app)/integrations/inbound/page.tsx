import { ModulePage } from "@/components/layout/module-page";
import { EvidenceInboundWorkspace } from "../../../workspaces/evidence-inbound-workspace";

export default function InboundPage() {
  return (
    <ModulePage
      title="Tích hợp"
      section="Vận hành"
      description="Kiểm tra inbound inbox, quarantine và outbound webhook delivery."
    >
      <EvidenceInboundWorkspace />
    </ModulePage>
  );
}
