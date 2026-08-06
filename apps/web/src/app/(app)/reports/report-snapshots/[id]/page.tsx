import { ReportSnapshotDetailWorkspace } from "@/app/workspaces/report-export-workspaces";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ version?: string }>;
}) {
  const { id } = await params;
  const { version } = await searchParams;
  return <ReportSnapshotDetailWorkspace snapshotId={id} version={version} />;
}
