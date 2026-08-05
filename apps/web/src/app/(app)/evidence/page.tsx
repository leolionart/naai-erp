import { ModulePage } from "@/components/layout/module-page";
import { EvidenceInboundWorkspace } from "../../workspaces/evidence-inbound-workspace";

export default function EvidencePage() {
  return (
    <ModulePage
      title="Chứng từ"
      section="Vận hành"
      description="Upload, review, version hóa và tải chứng từ theo phân quyền."
    >
      <EvidenceInboundWorkspace />
    </ModulePage>
  );
}
