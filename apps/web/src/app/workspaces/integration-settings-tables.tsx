"use client";

import type { ReactNode } from "react";
import { ClipboardIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PendingIntegrationAction } from "./integration-settings-dialogs";

export type WebhookSourceItem = Readonly<{
  kind: "webhook_source";
  id: string;
  publicId: string;
  name: string;
  actorId: string;
  secretRef: string;
  secretMode?: "managed" | "env";
  status: string;
  allowedEventTypes: readonly string[];
  autoRecord: boolean;
  version: string;
}>;

export type ApiCredentialItem = Readonly<{
  kind: "api_credential";
  id: string;
  name: string | null;
  actorId: string;
  roles: readonly string[];
  status: string;
  autoRecord: boolean;
  isOwnerCredential: boolean;
  version: string;
}>;

const SERVICE_KEY_HEADERS = ["Tên kết nối", "Actor ID", "Vai trò", "Trạng thái", "Tự động ghi sổ"];
const WEBHOOK_HEADERS = [
  "Tên nguồn",
  "Endpoint",
  "Actor",
  "Khóa ký",
  "Trạng thái",
  "Tự động ghi sổ",
];

function statusLabel(status: string) {
  return status === "active" ? "Đang hoạt động" : status === "revoked" ? "Đã thu hồi" : status;
}

function RowActions(
  p: Readonly<{
    active: boolean;
    disabled: boolean;
    rotateLabel: string;
    onRotate: () => void;
    onRevoke: () => void;
  }>,
) {
  if (!p.active) return null;
  return (
    <div className="flex justify-end gap-2">
      <Button type="button" size="sm" variant="outline" disabled={p.disabled} onClick={p.onRotate}>
        {p.rotateLabel}
      </Button>
      <Button type="button" size="sm" variant="outline" disabled={p.disabled} onClick={p.onRevoke}>
        Thu hồi
      </Button>
    </div>
  );
}

function IntegrationTableCard(
  p: Readonly<{
    title: string;
    description: string;
    action: ReactNode;
    loading: boolean;
    hasRows: boolean;
    emptyText: ReactNode;
    children: ReactNode;
  }>,
) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{p.title}</CardTitle>
        <CardDescription>{p.description}</CardDescription>
        <CardAction>{p.action}</CardAction>
      </CardHeader>
      <CardContent className="min-w-0">
        {p.loading ? (
          <Skeleton className="h-32 w-full" />
        ) : p.hasRows ? (
          p.children
        ) : (
          <p className="rounded-lg border border-dashed bg-muted/10 p-4 text-sm text-muted-foreground">
            {p.emptyText}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function ServiceKeysCard(
  p: Readonly<{
    items: readonly ApiCredentialItem[];
    loading: boolean;
    busy: boolean;
    action: ReactNode;
    onToggleAutoRecord: (cred: ApiCredentialItem, label: string) => void;
    onRequestAction: (action: PendingIntegrationAction) => void;
  }>,
) {
  return (
    <IntegrationTableCard
      title="Khóa kết nối dịch vụ"
      description="Khóa xác thực riêng (Service Keys) dành cho AI Agent, CLI và n8n — tách biệt hoàn toàn với phiên đăng nhập của chủ sở hữu và có thể thu hồi độc lập."
      action={p.action}
      loading={p.loading}
      hasRows={p.items.length > 0}
      emptyText={
        <>
          Chưa có khóa kết nối dịch vụ nào. Nhấn <strong>+ Tạo khóa kết nối</strong> để cấp khóa
          riêng cho AI Agent, CLI hoặc n8n.
        </>
      }
    >
      <Table columnVisibilityKey="integration-service-keys">
        <TableHeader>
          <TableRow>
            {SERVICE_KEY_HEADERS.map((h) => (
              <TableHead key={h}>{h}</TableHead>
            ))}
            <TableHead className="text-right">Thao tác</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {p.items.map((cred) => {
            const label = cred.name || cred.actorId;
            return (
              <TableRow key={cred.id}>
                <TableCell className="font-medium">{cred.name || cred.id}</TableCell>
                <TableCell className="font-mono text-xs">{cred.actorId}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {cred.roles.map((r) => (
                      <Badge key={r} variant="outline">
                        {r}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={cred.status === "active" ? "secondary" : "outline"}>
                    {statusLabel(cred.status)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Switch
                    aria-label={`Tự động ghi sổ cho ${label}`}
                    checked={cred.autoRecord}
                    disabled={p.busy || cred.status !== "active"}
                    onCheckedChange={() => p.onToggleAutoRecord(cred, label)}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <RowActions
                    active={cred.status === "active"}
                    disabled={p.busy}
                    rotateLabel="Cấp lại khóa"
                    onRotate={() =>
                      p.onRequestAction({
                        kind: "rotate_key",
                        id: cred.id,
                        label,
                        version: cred.version,
                      })
                    }
                    onRevoke={() =>
                      p.onRequestAction({
                        kind: "revoke_key",
                        id: cred.id,
                        label,
                        version: cred.version,
                      })
                    }
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </IntegrationTableCard>
  );
}

export function WebhookSourcesCard(
  p: Readonly<{
    items: readonly WebhookSourceItem[];
    loading: boolean;
    busy: boolean;
    action: ReactNode;
    onCopyEndpoint: (endpointPath: string) => void;
    onToggleAutoRecord: (src: WebhookSourceItem) => void;
    onRequestAction: (action: PendingIntegrationAction) => void;
  }>,
) {
  return (
    <IntegrationTableCard
      title="Nguồn Webhook đầu vào"
      description="Điểm nhận sự kiện có chữ ký HMAC dành cho Paperless-ngx và hệ thống gửi chứng từ tự động."
      action={p.action}
      loading={p.loading}
      hasRows={p.items.length > 0}
      emptyText={
        <>
          Chưa có nguồn Webhook đầu vào nào. Nhấn <strong>+ Tạo nguồn Webhook</strong> để khởi tạo
          endpoint và khóa ký tự động.
        </>
      }
    >
      <Table columnVisibilityKey="integration-webhook-sources">
        <TableHeader>
          <TableRow>
            {WEBHOOK_HEADERS.map((h) => (
              <TableHead key={h}>{h}</TableHead>
            ))}
            <TableHead className="text-right">Thao tác</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {p.items.map((src) => {
            const endpoint = `/api/v1/webhooks/inbound/${src.publicId}`;
            const managed =
              src.secretMode === "managed" || src.secretRef === "managed" || !src.secretRef;
            return (
              <TableRow key={src.id}>
                <TableCell className="font-medium">{src.name}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <code className="font-mono text-xs">{endpoint}</code>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Sao chép endpoint ${src.name}`}
                      onClick={() => p.onCopyEndpoint(endpoint)}
                    >
                      <ClipboardIcon />
                    </Button>
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs">{src.actorId}</TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {managed ? "Quản lý tự động" : `Biến MT: ${src.secretRef}`}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={src.status === "active" ? "secondary" : "outline"}>
                    {statusLabel(src.status)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Switch
                    aria-label={`Tự động ghi sổ cho ${src.name}`}
                    checked={src.autoRecord}
                    disabled={p.busy || src.status !== "active"}
                    onCheckedChange={() => p.onToggleAutoRecord(src)}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <RowActions
                    active={src.status === "active"}
                    disabled={p.busy}
                    rotateLabel="Cấp lại secret"
                    onRotate={() =>
                      p.onRequestAction({
                        kind: "rotate_webhook",
                        id: src.id,
                        label: src.name,
                        version: src.version,
                        publicId: src.publicId,
                      })
                    }
                    onRevoke={() =>
                      p.onRequestAction({
                        kind: "revoke_webhook",
                        id: src.id,
                        label: src.name,
                        version: src.version,
                      })
                    }
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </IntegrationTableCard>
  );
}
