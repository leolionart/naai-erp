import { FocusedRecordDetailWorkspace } from "@/app/workspaces/focused-record-workspaces";

export default async function Page({ params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  return <FocusedRecordDetailWorkspace kind="documents" recordId={documentId} />;
}
