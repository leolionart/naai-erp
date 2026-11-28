"use client";

import { type FormEvent, useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type LedgerDialogRow = Record<string, unknown>;

export type PendingJournalReasonAction = {
  action: "approve" | "reverse";
  journalId: string;
};

const JOURNAL_DRAFT_FIELDS: ReadonlyArray<{
  key: "id" | "date" | "description" | "debitAccount" | "creditAccount" | "amount";
  id: string;
  label: string;
  type?: string;
  required?: boolean;
  inputMode?: "numeric";
}> = [
  { key: "id", id: "journal-draft-id", label: "ID tùy chọn" },
  { key: "date", id: "journal-draft-date", label: "Ngày hạch toán", type: "date", required: true },
  { key: "description", id: "journal-draft-description", label: "Diễn giải", required: true },
  { key: "debitAccount", id: "journal-draft-debit", label: "Tài khoản Nợ", required: true },
  { key: "creditAccount", id: "journal-draft-credit", label: "Tài khoản Có", required: true },
  {
    key: "amount",
    id: "journal-draft-amount",
    label: "Số tiền minor units",
    required: true,
    inputMode: "numeric",
  },
];

export function CreateJournalDialog({
  onCreate,
  busy,
  defaultDate,
}: {
  onCreate: (body: LedgerDialogRow) => void;
  busy: boolean;
  defaultDate: string;
}) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    id: "",
    date: defaultDate,
    description: "",
    currency: "VND",
    debitAccount: "",
    creditAccount: "",
    amount: "",
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!/^\d+$/.test(form.amount) || BigInt(form.amount) <= 0n) return;
    onCreate({
      ...(form.id.trim() ? { id: form.id.trim() } : {}),
      journalDate: form.date,
      description: form.description,
      currency: form.currency,
      lines: [
        { accountCode: form.debitAccount, debitMinor: form.amount },
        { accountCode: form.creditAccount, creditMinor: form.amount },
      ],
    });
    setShowForm(false);
  }

  return (
    <Dialog open={showForm} onOpenChange={setShowForm}>
      <DialogTrigger asChild>
        <Button type="button">+ Bút toán nháp</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>Tạo bút toán nháp</DialogTitle>
          <DialogDescription>
            Nhập thông tin bút toán mới. Bút toán sẽ ở trạng thái nháp (draft) chờ duyệt.
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <FieldGroup className="grid gap-4 md:grid-cols-3">
            {JOURNAL_DRAFT_FIELDS.map((item) => (
              <Field key={item.key}>
                <FieldLabel htmlFor={item.id}>{item.label}</FieldLabel>
                <Input
                  id={item.id}
                  type={item.type}
                  required={item.required}
                  inputMode={item.inputMode}
                  value={form[item.key]}
                  onChange={(e) => setForm((v) => ({ ...v, [item.key]: e.target.value }))}
                />
              </Field>
            ))}
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              Lưu bản nháp
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CreateAccountDialog({
  onCreate,
  busy,
}: {
  onCreate: (data: LedgerDialogRow) => void;
  busy: boolean;
}) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", rootType: "expense" });

  function submit(event: FormEvent) {
    event.preventDefault();
    onCreate({
      code: form.code,
      name: form.name,
      root_type: form.rootType,
      is_control_account: false,
      allow_manual_posting: true,
      is_active: true,
    });
    setShowForm(false);
  }

  return (
    <Dialog open={showForm} onOpenChange={setShowForm}>
      <DialogTrigger asChild>
        <Button type="button">+ Tạo tài khoản</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Tạo tài khoản mới</DialogTitle>
          <DialogDescription>
            Thêm một tài khoản mới vào hệ thống tài khoản (COA).
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <FieldGroup className="grid gap-4">
            <Field>
              <FieldLabel htmlFor="account-new-code">Mã tài khoản</FieldLabel>
              <Input
                id="account-new-code"
                required
                value={form.code}
                onChange={(e) => setForm((v) => ({ ...v, code: e.target.value }))}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="account-new-name">Tên tài khoản</FieldLabel>
              <Input
                id="account-new-name"
                required
                value={form.name}
                onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="account-new-root-type">Nhóm</FieldLabel>
              <Select
                value={form.rootType}
                onValueChange={(value) => setForm((v) => ({ ...v, rootType: value }))}
              >
                <SelectTrigger id="account-new-root-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="asset">Tài sản</SelectItem>
                    <SelectItem value="liability">Nợ phải trả</SelectItem>
                    <SelectItem value="equity">Vốn chủ</SelectItem>
                    <SelectItem value="revenue">Doanh thu</SelectItem>
                    <SelectItem value="expense">Chi phí</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              Tạo tài khoản
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function JournalReasonDialog({
  pending,
  busy,
  onClose,
  onConfirm,
}: {
  pending: PendingJournalReasonAction | undefined;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (pending) setReason("");
  }, [pending]);

  const isReverse = pending?.action === "reverse";

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = reason.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
  }

  return (
    <Dialog open={Boolean(pending)} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{isReverse ? "Đảo bút toán" : "Duyệt bút toán"}</DialogTitle>
          <DialogDescription>
            {`Nhập lý do nghiệp vụ để ${isReverse ? "đảo" : "duyệt"} bút toán ${pending?.journalId ?? ""}. Lý do sẽ được lưu vào nhật ký kiểm toán.`}
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <Field>
            <FieldLabel htmlFor="journal-audit-reason">Lý do nghiệp vụ (được lưu audit)</FieldLabel>
            <Input
              id="journal-audit-reason"
              required
              autoFocus
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Nhập lý do nghiệp vụ…"
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
              Hủy
            </Button>
            <Button
              type="submit"
              variant={isReverse ? "destructive" : "default"}
              disabled={busy || !reason.trim()}
            >
              {busy ? "Đang xử lý…" : "Xác nhận"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeactivateAccountDialog({
  accountCode,
  busy,
  onClose,
  onConfirm,
}: {
  accountCode: string | undefined;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={Boolean(accountCode)} onOpenChange={(open) => !open && !busy && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {accountCode ? `Ngừng sử dụng tài khoản ${accountCode}?` : "Ngừng sử dụng tài khoản?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Tài khoản sẽ chuyển sang trạng thái ngừng hoạt động và không thể hạch toán mới, nhưng
            lịch sử sổ cái vẫn được giữ nguyên.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Hủy</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={busy} onClick={onConfirm}>
            {busy ? "Đang xử lý…" : "Xác nhận"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
