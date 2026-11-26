"use client";

import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import type { Row } from "./focused-record-shared";

export type StructuredDraftReason = Readonly<{
  code: string;
  message: string;
  field?: string;
}>;

export function extractDraftReasons(record: Row | undefined): readonly StructuredDraftReason[] {
  if (!record) return [];
  const state = typeof record.state === "string" ? record.state : "";
  if (state && state !== "draft") return [];
  const raw = Array.isArray(record.reasons)
    ? record.reasons
    : Array.isArray(record.draftReasons)
      ? record.draftReasons
      : Array.isArray(record.draft_reasons)
        ? record.draft_reasons
        : [];
  const out: StructuredDraftReason[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as Record<string, unknown>;
    const code = typeof candidate.code === "string" ? candidate.code.trim() : "";
    const message = typeof candidate.message === "string" ? candidate.message.trim() : "";
    const field = typeof candidate.field === "string" ? candidate.field.trim() : undefined;
    if (!code && !message) continue;
    out.push({
      code: code || "DRAFT_REASON",
      message: message || `Chưa đủ điều kiện tự ghi sổ (${code}).`,
      ...(field ? { field } : {}),
    });
  }
  return out;
}

export function DraftReasonsBadge({ record }: Readonly<{ record: Row | undefined }>) {
  const reasons = extractDraftReasons(record);
  if (reasons.length === 0) return null;
  const summary = reasons.map((item) => item.message).join(" • ");
  return (
    <Badge variant="outline" title={summary} className="ml-1.5 gap-1">
      <AlertTriangle className="size-3" />
      {reasons.length} lý do nháp
    </Badge>
  );
}

export function DraftReasonsAlert({ record }: Readonly<{ record: Row | undefined }>) {
  const reasons = extractDraftReasons(record);
  if (reasons.length === 0) return null;
  return (
    <Alert>
      <AlertTriangle />
      <AlertTitle>Bản ghi từ tích hợp đang giữ ở trạng thái nháp</AlertTitle>
      <AlertDescription>
        <p className="mb-1.5">
          Nguồn tích hợp bật tự động ghi sổ nhưng bản ghi chưa đủ điều kiện ghi sổ ngay:
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {reasons.map((reason, idx) => (
            <li key={`${reason.code}-${reason.field ?? idx}`}>
              <span>{reason.message}</span>{" "}
              <span className="text-xs text-muted-foreground">({reason.code})</span>
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
