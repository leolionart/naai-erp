import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { FocusedRecordErrorAlert } from "./focused-record-alerts";
import { human, text, type Row } from "./focused-record-shared";

export function ActionDialog({
  action,
  reason,
  setReason,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  action?: string;
  reason: string;
  setReason(value: string): void;
  busy: boolean;
  error: string;
  onClose(): void;
  onConfirm(): void;
}) {
  return (
    <Dialog
      open={Boolean(action)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Xác nhận {human(action ?? "")}</DialogTitle>
          <DialogDescription>
            Thao tác lifecycle được gửi qua cùng REST service với CLI/AI và có idempotency.
          </DialogDescription>
        </DialogHeader>
        <FocusedRecordErrorAlert kind="action" message={error} />
        <Field>
          <FieldLabel htmlFor="action-reason">Lý do</FieldLabel>
          <Input
            id="action-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button disabled={busy || !reason.trim()} onClick={onConfirm}>
            Xác nhận
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SourceCard({ source, record }: { source?: Row; record: Row }) {
  const url = text(source, "canonicalUrl", "url");
  const journalId = text(record, "journalId", "postingJournalId");
  const reconciliationIds = Array.isArray(record.reconciliationIds)
    ? record.reconciliationIds.map(String)
    : [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Nguồn và liên kết kế toán</CardTitle>
        <CardDescription>
          Paperless chỉ được hiển thị khi API trả external-reference metadata chính thức.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-sm text-muted-foreground">Nguồn ngoài</p>
          {source ? (
            <div className="flex flex-col gap-1">
              <strong>{text(source, "system") || "External"}</strong>
              <span className="font-mono text-xs">{text(source, "externalId")}</span>
              {url ? (
                <Button variant="link" className="w-fit px-0" asChild>
                  <a href={url} target="_blank" rel="noreferrer">
                    Mở nguồn canonical <ExternalLink data-icon="inline-end" />
                  </a>
                </Button>
              ) : null}
            </div>
          ) : (
            <p>Chưa có external reference.</p>
          )}
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Journal / reconciliation</p>
          <div className="flex flex-wrap gap-2">
            {journalId ? <Badge variant="outline">Journal {journalId}</Badge> : null}
            {reconciliationIds.map((id) => (
              <Button key={id} variant="outline" size="sm" asChild>
                <Link href={`/banking/reconciliation/${encodeURIComponent(id)}`}>
                  Reconciliation {id}
                </Link>
              </Button>
            ))}
            {!journalId && !reconciliationIds.length ? (
              <span>Chưa có liên kết đã post/đối soát.</span>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
