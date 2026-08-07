import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { FocusedRecordDetailWorkspace } from "@/app/workspaces/focused-record-workspaces";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <FocusedRecordDetailWorkspace kind="documents" recordId={id} />
    </Suspense>
  );
}
