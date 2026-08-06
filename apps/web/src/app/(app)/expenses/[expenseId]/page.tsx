import { FocusedRecordDetailWorkspace } from "@/app/workspaces/focused-record-workspaces";

export default async function Page({ params }: { params: Promise<{ expenseId: string }> }) {
  const { expenseId } = await params;
  return <FocusedRecordDetailWorkspace kind="expenses" recordId={expenseId} />;
}
