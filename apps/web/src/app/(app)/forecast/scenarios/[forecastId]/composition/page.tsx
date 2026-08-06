import { ModulePage } from "@/components/layout/module-page";
import { ForecastCompositionDetailWorkspace } from "@/app/workspaces/forecast-composition-workspace";

export default async function Page({ params }: { params: Promise<{ forecastId: string }> }) {
  const { forecastId } = await params;
  return (
    <ModulePage
      title="Forecast composition"
      section="Kế hoạch"
      description="Actual-to-date, committed revenue, weighted pipeline, expense forecast và projected cash."
    >
      <ForecastCompositionDetailWorkspace forecastId={forecastId} />
    </ModulePage>
  );
}
