import { ModulePage } from "@/components/layout/module-page";
import { BusinessRecordWorkspace } from "../../../workspaces/business-directory-workspace";

export default async function ProjectPage({
  params,
}: Readonly<{ params: Promise<{ projectId: string }> }>) {
  const { projectId } = await params;
  return (
    <ModulePage
      title="Hồ sơ dự án"
      section="Dự án"
      sectionHref="/projects"
      description="Thông tin dự án và các báo cáo tài chính liên quan."
    >
      <BusinessRecordWorkspace kind="projects" id={projectId} />
    </ModulePage>
  );
}
