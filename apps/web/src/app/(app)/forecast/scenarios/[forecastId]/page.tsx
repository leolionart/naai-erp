import { ModulePage } from "@/components/layout/module-page";
import { PlanningDetailWorkspace } from "../../../../workspaces/planning-workspaces";
export default async function Page({ params }: { params: Promise<{ forecastId: string }> }) {
  const { forecastId } = await params;
  return (
    <ModulePage
      title="Forecast version"
      section="Kế hoạch"
      description="Review scenario, snapshot và lifecycle của forecast version."
    >
      <PlanningDetailWorkspace kind="forecasts" id={forecastId} />
    </ModulePage>
  );
}
