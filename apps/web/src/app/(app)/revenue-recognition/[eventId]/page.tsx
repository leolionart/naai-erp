import { ModulePage } from "@/components/layout/module-page";
import { ResourceDetailWorkspace } from "../../../workspaces/project-revenue-workspaces";
export default async function Page({ params }: Readonly<{ params: Promise<{ eventId: string }> }>) {
  const { eventId } = await params;
  return (
    <ModulePage
      title="Recognition event"
      section="Revenue recognition"
      description="Source, recognized amount, journal và reversal lifecycle."
    >
      <ResourceDetailWorkspace kind="recognition" id={eventId} />
    </ModulePage>
  );
}
