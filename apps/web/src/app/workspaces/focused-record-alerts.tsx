import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const FOCUSED_RECORD_ERROR_TITLES = {
  load: "Không thể tải dữ liệu",
  action: "Không thể thực hiện thao tác",
  export: "Không thể export dữ liệu",
} as const;

export type FocusedRecordErrorKind = keyof typeof FOCUSED_RECORD_ERROR_TITLES;

export function FocusedRecordErrorAlert({
  kind,
  message,
}: Readonly<{
  kind: FocusedRecordErrorKind;
  message: string;
}>) {
  if (!message) return null;
  return (
    <Alert variant="destructive">
      <AlertTitle>{FOCUSED_RECORD_ERROR_TITLES[kind]}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
