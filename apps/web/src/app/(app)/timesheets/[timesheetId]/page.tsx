import { ModulePage } from "@/components/layout/module-page";
import { TimesheetDetailWorkspace } from "../../../workspaces/timesheet-workspaces";
export default async function Page({
  params,
}: Readonly<{ params: Promise<{ timesheetId: string }> }>) {
  const { timesheetId } = await params;
  return (
    <ModulePage
      title="Chi tiết timesheet"
      section="Timesheets"
      description="Entries, applied cost và lifecycle audit của timesheet."
    >
      <TimesheetDetailWorkspace timesheetId={timesheetId} />
    </ModulePage>
  );
}
