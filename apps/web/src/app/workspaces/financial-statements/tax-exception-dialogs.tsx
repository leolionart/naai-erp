"use client";

import { MoneyCell } from "@/components/financial/money-cell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TaxExpenseException } from "@/lib/api";
import type { TaxReviewState } from "./use-tax-expense-exceptions";

export function TaxFinalizeReviewDialog({
  open,
  onOpenChange,
  reason,
  onReasonChange,
  finalizing,
  onConfirm,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason: string;
  onReasonChange: (value: string) => void;
  finalizing: boolean;
  onConfirm: () => Promise<void> | void;
}>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hoàn tất review chi phí thuế?</DialogTitle>
          <DialogDescription>
            Backend sẽ chạy dry-run, sau đó cập nhật các dòng còn chờ review trong một giao dịch có
            audit và idempotency. Lịch sử journal không bị sửa.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="tax-finalize-reason">Lý do</FieldLabel>
          <Input
            id="tax-finalize-reason"
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
          />
        </Field>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Hủy</Button>
          </DialogClose>
          <Button onClick={() => void onConfirm()} disabled={finalizing || !reason.trim()}>
            {finalizing ? "Đang xử lý…" : "Xác nhận hoàn tất"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TaxItemReviewDialog({
  row,
  axis,
  state,
  onStateChange,
  amount,
  onAmountChange,
  taxCode,
  onTaxCodeChange,
  reason,
  onReasonChange,
  reviewing,
  onClose,
  onConfirm,
}: Readonly<{
  row: TaxExpenseException | null;
  axis: "cit" | "vat";
  state: TaxReviewState;
  onStateChange: (value: TaxReviewState) => void;
  amount: string;
  onAmountChange: (value: string) => void;
  taxCode: string;
  onTaxCodeChange: (value: string) => void;
  reason: string;
  onReasonChange: (value: string) => void;
  reviewing: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
}>) {
  return (
    <Dialog
      open={Boolean(row)}
      onOpenChange={(open) => {
        if (!open && !reviewing) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Review {axis === "vat" ? "VAT" : "CIT"} từng khoản</DialogTitle>
          <DialogDescription>
            {row?.description} · {row ? <MoneyCell minor={row.bookedMinor} /> : null}
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel>Trạng thái {axis === "vat" ? "VAT" : "CIT"}</FieldLabel>
          <Select value={state} onValueChange={(value) => onStateChange(value as TaxReviewState)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="eligible">Đủ điều kiện</SelectItem>
              <SelectItem value="partially_eligible">Đủ một phần</SelectItem>
              <SelectItem value="ineligible">Không đủ điều kiện</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {state !== "ineligible" ? (
          <Field>
            <FieldLabel htmlFor="cit-review-amount">
              Số tiền được tính {axis === "vat" ? "VAT" : "CIT"}
            </FieldLabel>
            <Input
              id="cit-review-amount"
              inputMode="numeric"
              value={amount}
              onChange={(e) => onAmountChange(e.target.value)}
            />
          </Field>
        ) : null}
        {axis === "vat" ? (
          <Field>
            <FieldLabel htmlFor="vat-review-tax-code">Mã thuế VAT</FieldLabel>
            <Select value={taxCode} onValueChange={onTaxCodeChange}>
              <SelectTrigger id="vat-review-tax-code">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="VAT10_IN">VAT đầu vào 10%</SelectItem>
                <SelectItem value="VAT10_OUT">VAT đầu ra 10%</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        ) : null}
        <Field>
          <FieldLabel htmlFor="cit-review-reason">Lý do</FieldLabel>
          <Input
            id="cit-review-reason"
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
          />
        </Field>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Hủy</Button>
          </DialogClose>
          <Button onClick={() => void onConfirm()} disabled={reviewing || !reason.trim()}>
            {reviewing ? "Đang lưu…" : "Xác nhận review"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TaxCodeAssignmentDialog({
  row,
  taxCodeValue,
  onTaxCodeValueChange,
  reason,
  onReasonChange,
  saving,
  onClose,
  onConfirm,
}: Readonly<{
  row: TaxExpenseException | null;
  taxCodeValue: string;
  onTaxCodeValueChange: (value: string) => void;
  reason: string;
  onReasonChange: (value: string) => void;
  saving: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
}>) {
  return (
    <Dialog
      open={Boolean(row)}
      onOpenChange={(open) => {
        if (!open && !saving) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gán mã thuế VAT</DialogTitle>
          <DialogDescription>
            {row?.description} · {row?.taxCode ? `Mã hiện tại: ${row.taxCode}` : "Chưa có mã thuế"}
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="tax-code-value">Mã số thuế VAT</FieldLabel>
          <Input
            id="tax-code-value"
            value={taxCodeValue}
            onChange={(e) => onTaxCodeValueChange(e.target.value)}
            placeholder="Ví dụ: VAT8_IN hoặc VAT10_IN"
          />
          <p className="text-xs text-muted-foreground">
            Bắt buộc nhập mã đã được accountant duyệt và đúng loại/thuế suất chứng từ.
          </p>
        </Field>
        <p className="text-sm text-muted-foreground">
          Backend sẽ chọn mã VAT đầu vào đang được duyệt và ghi audit; không thay đổi số tiền hay
          journal đã post.
        </p>
        <Field>
          <FieldLabel htmlFor="tax-code-reason">Lý do</FieldLabel>
          <Input
            id="tax-code-reason"
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
          />
        </Field>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Hủy</Button>
          </DialogClose>
          <Button
            onClick={() => void onConfirm()}
            disabled={saving || !reason.trim() || !taxCodeValue.trim()}
          >
            {saving ? "Đang lưu…" : "Gán mã thuế"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
