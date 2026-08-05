import { ModulePage } from "@/components/layout/module-page";
import { TimesheetEntryWorkspace } from "../../../../workspaces/timesheet-workspaces";
export default function Page() {
  return (
    <ModulePage
      title="Tạo timesheet"
      section="Timesheets"
      description="Tạo draft tuần với classification explicit và server validation."
    >
      <TimesheetEntryWorkspace />
    </ModulePage>
  );
}
