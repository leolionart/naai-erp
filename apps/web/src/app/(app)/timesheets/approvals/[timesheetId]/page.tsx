import { ModulePage } from "@/components/layout/module-page";
import { TimesheetDetailWorkspace } from "../../../../workspaces/timesheet-workspaces";
export default async function Page({
  params,
}: Readonly<{ params: Promise<{ timesheetId: string }> }>) {
  const { timesheetId } = await params;
  return (
    <ModulePage
      title="Review timesheet"
      section="Duyệt timesheet"
      description="Review chi tiết trước approve hoặc reject có lý do."
    >
      <TimesheetDetailWorkspace timesheetId={timesheetId} approval />
    </ModulePage>
  );
}
