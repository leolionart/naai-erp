"use client";

import { type FormEvent, useState } from "react";
import { ClipboardIcon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export type ServiceKeyRole = "accountant" | "finance_admin" | "approver" | "viewer";

export const SERVICE_KEY_ROLE_OPTIONS: ReadonlyArray<{ value: ServiceKeyRole; label: string }> = [
  { value: "accountant", label: "Kế toán & Nhập liệu (accountant)" },
  { value: "finance_admin", label: "Quản trị tài chính (finance_admin)" },
  { value: "approver", label: "Phê duyệt (approver)" },
  { value: "viewer", label: "Chỉ đọc báo cáo (viewer)" },
];

export type IssuedSecretInfo = Readonly<{
  kind: "service_key" | "webhook_secret";
  label: string;
  secret: string;
  webhookUrl?: string;
}>;

export type CreateServiceKeyInput = Readonly<{
  name: string;
  role: ServiceKeyRole;
  actorId?: string;
  autoRecord: boolean;
}>;

export type CreateWebhookInput = Readonly<{
  name: string;
  actorId?: string;
  autoRecord: boolean;
}>;

export type PendingIntegrationAction = Readonly<{
  kind: "rotate_key" | "revoke_key" | "rotate_webhook" | "revoke_webhook";
  id: string;
  label: string;
  version: string;
  publicId?: string;
}>;

function AutoRecordToggleField({
  id,
  checked,
  onChange,
}: Readonly<{ id: string; checked: boolean; onChange: (value: boolean) => void }>) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3">
      <FieldLabel htmlFor={id} className="cursor-pointer font-normal">
        Bật tự động ghi sổ (autoRecord)
      </FieldLabel>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export function IssuedSecretBanner({
  issued,
  onDismiss,
}: Readonly<{ issued: IssuedSecretInfo; onDismiss: () => void }>) {
  async function copySecret() {
    await navigator.clipboard.writeText(issued.secret);
    toast.success("Đã sao chép khóa bí mật vào clipboard.");
  }

  return (
    <Alert data-testid="issued-secret-banner" className="border-primary/40 bg-primary/5">
      <AlertTitle>Khóa bí mật vừa khởi tạo (chỉ hiển thị một lần duy nhất)</AlertTitle>
      <AlertDescription className="mt-2 flex min-w-0 flex-col gap-3">
        <div className="text-xs text-muted-foreground">
          <span>
            {issued.kind === "service_key" ? "Khóa kết nối dịch vụ" : "Khóa ký HMAC Webhook"}:{" "}
            <strong className="text-foreground">{issued.label}</strong>. Hãy lưu ngay vào trình quản
            lý bí mật của AI Agent, CLI hoặc n8n — hệ thống sẽ không hiển thị lại sau khi đóng.
          </span>
          {issued.webhookUrl ? (
            <span className="mt-1 block">
              Webhook URL: <code className="break-all font-mono">{issued.webhookUrl}</code>
            </span>
          ) : null}
        </div>
        <code className="block min-w-0 break-all rounded-md border bg-background px-3 py-2 font-mono text-xs text-foreground">
          {issued.secret}
        </code>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void copySecret()}>
            <ClipboardIcon data-icon="inline-start" /> Sao chép khóa
          </Button>
          <Button type="button" size="sm" onClick={onDismiss}>
            Đã lưu an toàn
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}

export function CreateServiceKeyDialog({
  onCreate,
}: Readonly<{ onCreate: (input: CreateServiceKeyInput) => Promise<void> }>) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState<ServiceKeyRole>("accountant");
  const [actorId, setActorId] = useState("");
  const [autoRecord, setAutoRecord] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dialogError, setDialogError] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setDialogError("");
    try {
      await onCreate({
        name: name.trim(),
        role,
        ...(actorId.trim() ? { actorId: actorId.trim() } : {}),
        autoRecord,
      });
      setName("");
      setRole("accountant");
      setActorId("");
      setAutoRecord(false);
      setOpen(false);
    } catch (cause) {
      setDialogError(cause instanceof Error ? cause.message : "Không thể khởi tạo khóa kết nối.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (setOpen(next), next && setDialogError(""))}>
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          + Tạo khóa kết nối
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form className="flex flex-col gap-4" onSubmit={(e) => void handleSubmit(e)}>
          <DialogHeader>
            <DialogTitle>Tạo khóa kết nối dịch vụ</DialogTitle>
            <DialogDescription>
              Cấp khóa riêng (naai_sk_...) cho AI Agent, CLI hoặc n8n với phân quyền rõ ràng và dấu
              vết audit độc lập.
            </DialogDescription>
          </DialogHeader>
          {dialogError ? (
            <Alert variant="destructive">
              <AlertTitle>Không thể tạo khóa kết nối</AlertTitle>
              <AlertDescription>{dialogError}</AlertDescription>
            </Alert>
          ) : null}
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="service-key-name">Tên kết nối</FieldLabel>
              <Input
                id="service-key-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="n8n OCR Hóa đơn"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="service-key-role">Vai trò phân quyền</FieldLabel>
              <Select value={role} onValueChange={(v) => setRole(v as ServiceKeyRole)}>
                <SelectTrigger id="service-key-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SERVICE_KEY_ROLE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="service-key-actor">Định danh Actor (tùy chọn)</FieldLabel>
              <Input
                id="service-key-actor"
                value={actorId}
                onChange={(e) => setActorId(e.target.value)}
                placeholder="Để trống hệ thống tự sinh theo tên"
              />
            </Field>
            <AutoRecordToggleField
              id="service-key-auto-record"
              checked={autoRecord}
              onChange={setAutoRecord}
            />
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => setOpen(false)}
            >
              Hủy
            </Button>
            <Button type="submit" disabled={submitting || !name.trim()}>
              {submitting ? "Đang tạo…" : "Khởi tạo khóa"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CreateWebhookDialog({
  onCreate,
}: Readonly<{ onCreate: (input: CreateWebhookInput) => Promise<void> }>) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [actorId, setActorId] = useState("");
  const [autoRecord, setAutoRecord] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dialogError, setDialogError] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setDialogError("");
    try {
      await onCreate({
        name: name.trim(),
        ...(actorId.trim() ? { actorId: actorId.trim() } : {}),
        autoRecord,
      });
      setName("");
      setActorId("");
      setAutoRecord(false);
      setOpen(false);
    } catch (cause) {
      setDialogError(cause instanceof Error ? cause.message : "Không thể tạo nguồn Webhook.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (setOpen(next), next && setDialogError(""))}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          + Tạo nguồn Webhook
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form className="flex flex-col gap-4" onSubmit={(e) => void handleSubmit(e)}>
          <DialogHeader>
            <DialogTitle>Tạo nguồn Webhook đầu vào</DialogTitle>
            <DialogDescription>
              Hệ thống tự sinh khóa ký HMAC bảo mật (naai_whsec_...) mà không cần khai báo biến môi
              trường máy chủ.
            </DialogDescription>
          </DialogHeader>
          {dialogError ? (
            <Alert variant="destructive">
              <AlertTitle>Không thể tạo nguồn Webhook</AlertTitle>
              <AlertDescription>{dialogError}</AlertDescription>
            </Alert>
          ) : null}
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="webhook-source-name">Tên nguồn</FieldLabel>
              <Input
                id="webhook-source-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Paperless OCR"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="webhook-source-actor">Định danh Actor (tùy chọn)</FieldLabel>
              <Input
                id="webhook-source-actor"
                value={actorId}
                onChange={(e) => setActorId(e.target.value)}
                placeholder="Để trống hệ thống tự sinh"
              />
            </Field>
            <AutoRecordToggleField
              id="webhook-source-auto-record"
              checked={autoRecord}
              onChange={setAutoRecord}
            />
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => setOpen(false)}
            >
              Hủy
            </Button>
            <Button type="submit" disabled={submitting || !name.trim()}>
              {submitting ? "Đang tạo…" : "Tạo nguồn Webhook"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ConfirmIntegrationActionDialog({
  action,
  busy,
  onCancel,
  onConfirm,
}: Readonly<{
  action: PendingIntegrationAction | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (action: PendingIntegrationAction) => Promise<void>;
}>) {
  if (!action) return null;
  const isRevoke = action.kind === "revoke_key" || action.kind === "revoke_webhook";
  const titles: Record<PendingIntegrationAction["kind"], string> = {
    rotate_key: `Cấp lại khóa cho "${action.label}"?`,
    revoke_key: `Thu hồi khóa "${action.label}"?`,
    rotate_webhook: `Cấp lại secret cho "${action.label}"?`,
    revoke_webhook: `Thu hồi nguồn Webhook "${action.label}"?`,
  };

  return (
    <AlertDialog open onOpenChange={(open) => !open && !busy && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titles[action.kind]}</AlertDialogTitle>
          <AlertDialogDescription>
            {isRevoke
              ? "Kết nối này sẽ bị vô hiệu hóa ngay lập tức và không thể tiếp tục gửi dữ liệu vào hệ thống."
              : "Khóa cũ sẽ hết hiệu lực ngay khi khóa mới được phát hành một lần duy nhất."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy} onClick={onCancel}>
            Hủy
          </AlertDialogCancel>
          <AlertDialogAction
            variant={isRevoke ? "destructive" : "default"}
            disabled={busy}
            onClick={() => void onConfirm(action)}
          >
            {busy ? "Đang xử lý…" : isRevoke ? "Xác nhận thu hồi" : "Xác nhận cấp lại"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
