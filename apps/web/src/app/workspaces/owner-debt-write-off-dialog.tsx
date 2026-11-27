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

export function OwnerDebtWriteOffDialog({
  open,
  onOpenChange,
  maxBalanceMinor,
  onSuccess,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  maxBalanceMinor: string;
  onSuccess: (message: string) => Promise<void> | void;
}>) {
  const { client } = useAuthenticatedApiClient();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const amountMinor = amount.replace(/\D/g, "");
    if (!amountMinor || BigInt(amountMinor) <= 0n) {
      setError("Vui lòng nhập số tiền xóa nợ lớn hơn 0.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await client.data("banking/owner-debt-write-offs", {
        method: "POST",
        body: {
          schemaVersion: 1,
          bookingDate: form.get("bookingDate"),
          amountMinor,
          currency: "VND",
          description: form.get("description"),
          reason: form.get("reason"),
        },
      });
      setAmount("");
      onOpenChange(false);
      await onSuccess("Đã xóa nợ chủ doanh nghiệp và chuyển thành vốn chủ góp thêm (411-CAPITAL).");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể thực hiện xóa nợ chủ.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Xóa nợ chủ doanh nghiệp → Vốn chủ góp thêm</DialogTitle>
          <DialogDescription>
            Chuyển phần công nợ công ty nợ chủ (3388-OWNER, tối đa {formatVnd(maxBalanceMinor)})
            thành vốn chủ sở hữu góp thêm (411-CAPITAL). Không làm thay đổi tiền mặt công ty.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Field>
            <FieldLabel htmlFor="owner-wo-date">Ngày hạch toán</FieldLabel>
            <Input
              id="owner-wo-date"
              name="bookingDate"
              type="date"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="owner-wo-amount">Số tiền xóa nợ (VND)</FieldLabel>
            <Input
              id="owner-wo-amount"
              value={amount}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "");
                setAmount(digits ? Number(digits).toLocaleString("vi-VN") : "");
              }}
              placeholder="Ví dụ: 50.000.000"
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="owner-wo-desc">Diễn giải</FieldLabel>
            <Input
              id="owner-wo-desc"
              name="description"
              defaultValue="Chủ doanh nghiệp xóa nợ chi hộ, chuyển thành vốn chủ góp thêm"
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="owner-wo-reason">Lý do kiểm toán</FieldLabel>
            <Input
              id="owner-wo-reason"
              name="reason"
              defaultValue="Chủ doanh nghiệp xác nhận miễn/xóa nợ cho công ty"
              required
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Đang xử lý..." : "Xác nhận xóa nợ"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
