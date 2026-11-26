"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { formatApiErrorMessage, useAuthenticatedApiClient } from "@/lib/api";
import { FocusedRecordErrorAlert } from "./focused-record-alerts";
import { sourceEndpoint, text, type Row, type SourceKind } from "./focused-record-shared";
import { voidPlan } from "./focused-record-void-plan";

/**
 * "Remove a wrong transaction" control: delete a draft, cancel an unposted document or void a
 * posted one with a reversing journal. Always asks for a reason, which is stored in the audit log.
 */
export function RecordVoidControl({
  source,
  record,
  onDone,
}: Readonly<{ source: SourceKind; record: Row; onDone: () => void | Promise<void> }>) {
  const { client } = useAuthenticatedApiClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const plan = voidPlan(source, record);
  if (!plan) return null;
  if (plan.kind === "blocked")
    return (
      <Alert>
        <AlertDescription>{plan.message}</AlertDescription>
      </Alert>
    );

  async function confirm() {
    if (!plan || plan.kind === "blocked" || !reason.trim()) return;
    const id = text(record, "id");
    setBusy(true);
    setError("");
    try {
      await client.data(`${sourceEndpoint(source)}/${encodeURIComponent(id)}${plan.suffix}`, {
        method: plan.method,
        body: { reason: reason.trim() },
        ...(plan.versioned ? { expectedVersion: text(record, "resourceVersion", "version") } : {}),
        // One key per user confirmation: a double click retries the same request safely.
        idempotencyKey: `${plan.kind}-${source}-${id}-${crypto.randomUUID()}`,
      });
      toast.success(plan.success);
      setOpen(false);
      setReason("");
      await onDone();
    } catch (cause) {
      setError(formatApiErrorMessage(cause, "Không thể thực hiện thao tác."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="w-fit border-destructive text-destructive hover:bg-destructive/10"
        onClick={() => setOpen(true)}
      >
        {plan.buttonLabel}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setReason("");
            setError("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{plan.title}</DialogTitle>
            <DialogDescription>{plan.description}</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="void-reason">Lý do (bắt buộc)</FieldLabel>
            <Textarea
              id="void-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Ví dụ: Nhập nhầm số tiền / giao dịch bị trùng"
            />
          </Field>
          <FocusedRecordErrorAlert kind="action" message={error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Đóng
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void confirm()}
              disabled={busy || !reason.trim()}
            >
              {busy ? "Đang xử lý…" : "Xác nhận"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
