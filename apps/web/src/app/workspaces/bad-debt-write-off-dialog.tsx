"use client";

import { useState, type FormEvent } from "react";
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
import { Input } from "@/components/ui/input";
import { useAuthenticatedApiClient } from "@/lib/api";

const formatVnd = (minor: string) => `${Number(minor || 0).toLocaleString("vi-VN")} ₫`;

export type BadDebtTarget = Readonly<{
  id: string;
  sourceId: string;
  documentNumber: string;
  partyName: string;
  outstandingMinor: string;
}>;

export function BadDebtWriteOffDialog({
  target,
  onClose,
  onSuccess,
}: Readonly<{
  target?: BadDebtTarget;
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
}>) {
  const { client } = useAuthenticatedApiClient();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!target) return;
    const form = new FormData(event.currentTarget);
    const amountMinor = amount.replace(/\D/g, "") || target.outstandingMinor;
    if (!amountMinor || BigInt(amountMinor) <= 0n) {
      setError("Số tiền xóa nợ phải lớn hơn 0.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await client.data(`commercial-documents/${encodeURIComponent(target.sourceId)}/write-off`, {
        method: "POST",
        body: {
          writeOffDate: form.get("writeOffDate"),
          amountMinor,
          reason: form.get("reason"),
        },
      });
      setAmount("");
      onClose();
      await onSuccess();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể xóa nợ hóa đơn.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={Boolean(target)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Xóa nợ phải thu khó đòi</DialogTitle>
          <DialogDescription>
            Hóa đơn {target?.documentNumber} · {target?.partyName} · Còn lại{" "}
            {formatVnd(target?.outstandingMinor ?? "0")}. Ghi nhận Nợ 642-OPEX / Có 131-AR.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Field>
            <FieldLabel htmlFor="ar-wo-date">Ngày xóa nợ</FieldLabel>
            <Input
              id="ar-wo-date"
              name="writeOffDate"
              type="date"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="ar-wo-amount">
              Số tiền xóa nợ (để trống để xóa toàn bộ {formatVnd(target?.outstandingMinor ?? "0")})
            </FieldLabel>
            <Input
              id="ar-wo-amount"
              value={amount}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "");
                setAmount(digits ? Number(digits).toLocaleString("vi-VN") : "");
              }}
              placeholder={Number(target?.outstandingMinor ?? 0).toLocaleString("vi-VN")}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="ar-wo-reason">Lý do xóa nợ</FieldLabel>
            <Input
              id="ar-wo-reason"
              name="reason"
              defaultValue="Khách hàng không còn khả năng thanh toán / xóa nợ khó đòi"
              required
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Hủy
            </Button>
            <Button type="submit" variant="destructive" disabled={busy}>
              {busy ? "Đang xử lý..." : "Xác nhận xóa nợ"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
