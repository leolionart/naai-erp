import { ModulePage } from "@/components/layout/module-page";
import { StatementSessionWorkspace } from "../../../../workspaces/statement-session-workspace";

export default async function StatementSessionPage({
  params,
}: Readonly<{ params: Promise<{ sessionId: string }> }>) {
  const { sessionId } = await params;
  return (
    <ModulePage
      title="Chi tiết kỳ sao kê"
      section="Kiểm soát sao kê"
      sectionHref="/banking/statements"
      description="Import dispositions, balance movement, transaction coverage và close blockers của một kỳ sao kê."
    >
      <StatementSessionWorkspace sessionId={sessionId} />
    </ModulePage>
  );
}
