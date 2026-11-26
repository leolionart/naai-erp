"use client";

import { useState } from "react";
import { CheckCircle2, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { FocusedRecordErrorAlert } from "./focused-record-alerts";
import {
  DEFAULT_SOLOPRENEUR_RECORD_REASON,
  actionDisplayLabel,
  type DetailActionPlan,
} from "./focused-record-actions";
import { human } from "./focused-record-shared";

export function FocusedRecordDetailToolbar({
  state,
  plan,
  busy,
  onOpenEdit,
  onRecord,
  onSelectLifecycleAction,
  onOpenReview,
}: Readonly<{
  state: string;
  plan: DetailActionPlan;
  busy: boolean;
  onOpenEdit: () => void;
  onRecord: (reason: string) => void;
  onSelectLifecycleAction: (action: string) => void;
  onOpenReview: () => void;
}>) {
  const [recordReason, setRecordReason] = useState(DEFAULT_SOLOPRENEUR_RECORD_REASON);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {state === "draft" ? (
        <Button variant="outline" onClick={onOpenEdit} disabled={busy}>
          Sửa draft
        </Button>
      ) : null}

      {plan.showOneClickRecord ? (
        <>
          <Input
            aria-label="Lý do ghi sổ"
            value={recordReason}
            onChange={(event) => setRecordReason(event.target.value)}
            placeholder={DEFAULT_SOLOPRENEUR_RECORD_REASON}
            className="h-9 w-44 text-sm"
          />
          <Button
            type="button"
            disabled={busy}
            onClick={() => onRecord(recordReason.trim() || DEFAULT_SOLOPRENEUR_RECORD_REASON)}
          >
            <CheckCircle2 data-icon="inline-start" />
            Ghi sổ
          </Button>
        </>
      ) : null}

      {plan.primaryLifecycleActions.map((name) => (
        <Button
          key={name}
          variant={name === "cancel" || name === "reject" ? "destructive" : "outline"}
          disabled={busy}
          onClick={() => onSelectLifecycleAction(name)}
        >
          {human(name)}
        </Button>
      ))}

      {plan.showStandaloneReviewButton ? (
        <Button variant="outline" disabled={busy} onClick={onOpenReview}>
          Review quản trị / thuế
        </Button>
      ) : null}

      {plan.overflowActions.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={busy} aria-label="Thao tác khác">
              <MoreHorizontal data-icon="inline-start" />
              Thao tác khác
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {plan.overflowActions.map((item) => (
              <DropdownMenuItem
                key={item}
                onSelect={() => {
                  if (item === "review") onOpenReview();
                  else onSelectLifecycleAction(item);
                }}
              >
                {actionDisplayLabel(item)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

export function QuickViewOneClickRecordBar({
  busy,
  onRecord,
}: Readonly<{
  busy: boolean;
  onRecord: (reason: string) => void;
}>) {
  const [reason, setReason] = useState(DEFAULT_SOLOPRENEUR_RECORD_REASON);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Bản nháp sẵn sàng ghi sổ một bước</p>
        <p className="text-xs text-muted-foreground">
          Tự duyệt, áp mặc định thuế & bằng chứng thanh toán, tạo bút toán cân đối trong một giao
          dịch.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Lý do ghi sổ"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={DEFAULT_SOLOPRENEUR_RECORD_REASON}
          className="h-9 w-44 text-sm"
        />
        <Button
          type="button"
          disabled={busy}
          onClick={() => onRecord(reason.trim() || DEFAULT_SOLOPRENEUR_RECORD_REASON)}
        >
          <CheckCircle2 data-icon="inline-start" />
          Ghi sổ
        </Button>
      </div>
    </div>
  );
}

export function ReviewExpenseDialog({
  open,
  onOpenChange,
  axis,
  onAxisChange,
  reviewState,
  onReviewStateChange,
  reason,
  onReasonChange,
  busy,
  error,
  onConfirm,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  axis: string;
  onAxisChange: (axis: string) => void;
  reviewState: string;
  onReviewStateChange: (state: string) => void;
  reason: string;
  onReasonChange: (reason: string) => void;
  busy: boolean;
  error: string;
  onConfirm: () => void;
}>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Review chi phí</DialogTitle>
          <DialogDescription>Trạng thái quản trị, CIT và VAT độc lập.</DialogDescription>
        </DialogHeader>
        <FocusedRecordErrorAlert kind="action" message={error} />
        <FieldGroup>
          <Field>
            <FieldLabel>Trục review</FieldLabel>
            <Select value={axis} onValueChange={onAxisChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="management">Quản trị</SelectItem>
                  <SelectItem value="cit">CIT</SelectItem>
                  <SelectItem value="vat">VAT</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Kết quả</FieldLabel>
            <Select value={reviewState} onValueChange={onReviewStateChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {(axis === "management"
                    ? ["valid", "invalid", "accountant_override"]
                    : ["eligible", "partially_eligible", "ineligible", "accountant_override"]
                  ).map((value) => (
                    <SelectItem key={value} value={value}>
                      {human(value)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="review-reason">Lý do</FieldLabel>
            <Input
              id="review-reason"
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
            />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button disabled={busy || !reason.trim()} onClick={onConfirm}>
            Lưu review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
