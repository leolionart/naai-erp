"use client";

import Link from "next/link";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FocusedRecordErrorAlert } from "./focused-record-alerts";
import {
  fundingLabel,
  fundingOptionValue,
  isCurrentFunding,
  type FundingOption,
  type Row,
} from "./focused-record-shared";

export function DeleteDraftPurchaseInvoiceDialog({
  open,
  onOpenChange,
  reason,
  onReasonChange,
  busy,
  error,
  onConfirm,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason: string;
  onReasonChange: (value: string) => void;
  busy: boolean;
  error: string;
  onConfirm: () => void;
}>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Xóa hóa đơn mua vào bản nháp?</DialogTitle>
          <DialogDescription>
            Chỉ bản nháp chưa có journal mới được xóa. Thao tác được ghi audit và không thể hoàn
            tác.
          </DialogDescription>
        </DialogHeader>
        <FocusedRecordErrorAlert kind="action" message={error} />
        <Field data-invalid={reason.length > 0 && !reason.trim()}>
          <FieldLabel htmlFor="delete-purchase-invoice-reason">Lý do xóa</FieldLabel>
          <Textarea
            id="delete-purchase-invoice-reason"
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder="Ví dụ: Hóa đơn nhập nhầm hoặc bị trùng"
            aria-invalid={reason.length > 0 && !reason.trim()}
          />
        </Field>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Giữ lại
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy || !reason.trim()}
            onClick={onConfirm}
          >
            {busy ? "Đang xóa…" : "Xác nhận xóa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReclassifyFundingDialog({
  open,
  onOpenChange,
  quickRecord,
  options,
  targetAccount,
  onTargetAccountChange,
  reason,
  onReasonChange,
  busy,
  error,
  onConfirm,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quickRecord?: Row;
  options: readonly FundingOption[];
  targetAccount: string;
  onTargetAccountChange: (value: string) => void;
  reason: string;
  onReasonChange: (value: string) => void;
  busy: boolean;
  error: string;
  onConfirm: () => void;
}>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Đổi sang nguồn thanh toán khác?</DialogTitle>
          <DialogDescription>
            Bút toán đã ghi sổ sẽ được đảo và tạo bản thay thế ở trạng thái nháp. Lịch sử và đối
            soát cũ được giữ nguyên; bản thay thế sẽ ghi nhận theo nguồn bạn chọn.
          </DialogDescription>
        </DialogHeader>
        <FocusedRecordErrorAlert kind="action" message={error} />
        <Field>
          <FieldLabel htmlFor="reclassify-funding-target">Nguồn thanh toán mới</FieldLabel>
          <Select value={targetAccount} onValueChange={onTargetAccountChange}>
            <SelectTrigger id="reclassify-funding-target" className="w-full min-w-0">
              <SelectValue placeholder="Chọn nguồn thanh toán" />
            </SelectTrigger>
            <SelectContent>
              {options
                .filter((option) => !isCurrentFunding(option, quickRecord))
                .map((option) => (
                  <SelectItem key={fundingOptionValue(option)} value={fundingOptionValue(option)}>
                    {option.label}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            Sẽ chuyển sang: {fundingLabel(targetAccount, options)}
          </p>
        </Field>
        <Field>
          <FieldLabel htmlFor="reclassify-funding-reason">Lý do điều chỉnh</FieldLabel>
          <Textarea
            id="reclassify-funding-reason"
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder="Ví dụ: Hóa đơn do chủ doanh nghiệp thanh toán bằng tiền cá nhân"
          />
        </Field>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Hủy
          </Button>
          <Button type="button" disabled={busy || !reason.trim()} onClick={onConfirm}>
            {busy ? "Đang xử lý…" : "Xác nhận đổi nguồn"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RecognitionQuickViewSummary({ recordId }: Readonly<{ recordId: string }>) {
  return (
    <div className="grid gap-3 rounded-lg border p-4">
      <p className="font-medium">Trục doanh thu: Đã ghi nhận</p>
      <p className="text-sm text-muted-foreground">
        Đây là nghiệp vụ ghi nhận doanh thu chưa có quan hệ hóa đơn rõ ràng. Hệ thống không suy đoán
        liên kết từ số tiền, ngày hoặc dự án.
      </p>
      <Button asChild variant="outline" className="w-fit">
        <Link href={`/revenue-recognition/${encodeURIComponent(recordId)}`}>Mở trang chi tiết</Link>
      </Button>
    </div>
  );
}
