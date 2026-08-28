import { FocusedRecordDetailWorkspace } from "../../../workspaces/focused-record-workspaces";

export default async function RevenueDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FocusedRecordDetailWorkspace kind="documents" recordId={id} />;
}
