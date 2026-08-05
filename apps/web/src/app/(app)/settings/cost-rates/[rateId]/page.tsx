import { ModulePage } from "@/components/layout/module-page";
import { CostRateDetailWorkspace } from "../../../../workspaces/cost-rate-workspaces";
export default async function Page({ params }: Readonly<{ params: Promise<{ rateId: string }> }>) {
  const { rateId } = await params;
  return (
    <ModulePage
      title="Chi tiết cost rate"
      section="Chi phí nhân sự"
      description="Effective version, approval và retirement history."
    >
      <CostRateDetailWorkspace rateId={rateId} />
    </ModulePage>
  );
}
