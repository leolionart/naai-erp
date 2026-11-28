"use client";

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
import type {
  VatActionKind,
  VatReconciliationItem,
  VatReviewState,
} from "./use-financial-statement-report";

export function VatItemActionDialog({
  item,
  action,
  state,
  onStateChange,
  taxCode,
  onTaxCodeChange,
  reason,
  onReasonChange,
  saving,
  onClose,
  onConfirm,
}: Readonly<{
  item?: VatReconciliationItem;
  action?: VatActionKind;
  state: VatReviewState;
  onStateChange: (value: VatReviewState) => void;
  taxCode: string;
  onTaxCodeChange: (value: string) => void;
  reason: string;
  onReasonChange: (value: string) => void;
  saving: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
}>) {
  return (
    <Dialog
      open={Boolean(item)}
      onOpenChange={(open) => {
        if (!open && !saving) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {action === "resolve-tax-code" ? "Gán mã thuế VAT" : "Review VAT"}
          </DialogTitle>
          <DialogDescription>
            {item?.sourceId} · dòng {item?.lineNumber ?? 1}
          </DialogDescription>
        </DialogHeader>
        {action === "review-vat" ? (
          <Field>
            <FieldLabel>Trạng thái VAT</FieldLabel>
            <Select value={state} onValueChange={(value) => onStateChange(value as VatReviewState)}>
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
        ) : null}
        {action === "resolve-tax-code" ? (
          <Field>
            <FieldLabel htmlFor="vat-action-tax-code">Mã số thuế VAT</FieldLabel>
            <Input
              id="vat-action-tax-code"
              value={taxCode}
              onChange={(event) => onTaxCodeChange(event.target.value)}
              placeholder="Ví dụ: VAT8_IN hoặc VAT10_IN"
            />
            <p className="text-xs text-muted-foreground">
              Nhập đúng mã đã được accountant duyệt và còn hiệu lực cho ngày chứng từ.
            </p>
          </Field>
        ) : null}
        <Field>
          <FieldLabel htmlFor="vat-action-reason">Lý do</FieldLabel>
          <Input
            id="vat-action-reason"
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
          />
        </Field>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Hủy</Button>
          </DialogClose>
          <Button
            onClick={() => void onConfirm()}
            disabled={
              saving || !reason.trim() || (action === "resolve-tax-code" && !taxCode.trim())
            }
          >
            {saving ? "Đang lưu…" : "Xác nhận"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
