"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuthenticatedApiClient } from "@/lib/api";

type WebhookSourceItem = Readonly<{
  kind: "webhook_source";
  id: string;
  publicId: string;
  name: string;
  actorId: string;
  secretRef: string;
  status: string;
  allowedEventTypes: readonly string[];
  autoRecord: boolean;
  version: string;
}>;

type ApiCredentialItem = Readonly<{
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

type IntegrationOverview = Readonly<{
  operatingMode: "controlled" | "solopreneur";
  webhookSources: readonly WebhookSourceItem[];
  apiCredentials: readonly ApiCredentialItem[];
}>;

export function IntegrationAutoRecordSection() {
  const { client, hydrated, hasToken } = useAuthenticatedApiClient();
  const [overview, setOverview] = useState<IntegrationOverview>();
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");
  const [newActorId, setNewActorId] = useState("paperless-n8n");
  const [newSecretRef, setNewSecretRef] = useState("PAPERLESS_WEBHOOK_SECRET");
  const [newAutoRecord, setNewAutoRecord] = useState(false);

  const load = useCallback(async () => {
    if (!hydrated) return;
    if (!hasToken) {
      setError("Cần API token để quản lý cấu hình nguồn tích hợp.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await client.data<IntegrationOverview>("integration-sources");
      setOverview(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể tải danh sách nguồn tích hợp.");
    } finally {
      setLoading(false);
    }
  }, [client, hasToken, hydrated]);

  useEffect(() => void load(), [load]);

  async function toggleCredential(item: ApiCredentialItem) {
    const key = `cred:${item.id}`;
    setBusyKey(key);
    setError("");
    try {
      await client.data(`api-credentials/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        expectedVersion: item.version,
        body: {
          autoRecord: !item.autoRecord,
          reason: !item.autoRecord
            ? "Bật tự động ghi sổ cho token tích hợp"
            : "Tắt tự động ghi sổ cho token tích hợp",
        },
      });
      toast.success(
        !item.autoRecord
          ? `Đã bật tự động ghi sổ cho ${item.name || item.actorId}`
          : `Đã tắt tự động ghi sổ cho ${item.name || item.actorId}`,
      );
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể cập nhật token tích hợp.");
    } finally {
      setBusyKey("");
    }
  }

  async function toggleWebhook(item: WebhookSourceItem) {
    const key = `wh:${item.id}`;
    setBusyKey(key);
    setError("");
    try {
      await client.data(`integration-sources/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        expectedVersion: item.version,
        body: {
          autoRecord: !item.autoRecord,
          reason: !item.autoRecord
            ? "Bật tự động ghi sổ cho nguồn webhook"
            : "Tắt tự động ghi sổ cho nguồn webhook",
        },
      });
      toast.success(
        !item.autoRecord
          ? `Đã bật tự động ghi sổ cho ${item.name}`
          : `Đã tắt tự động ghi sổ cho ${item.name}`,
      );
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể cập nhật nguồn webhook.");
    } finally {
      setBusyKey("");
    }
  }

  async function createWebhookSource() {
    if (!newName.trim() || !newActorId.trim() || !newSecretRef.trim()) return;
    setBusyKey("create-webhook");
    setError("");
    try {
      await client.data("integration-sources", {
        method: "POST",
        body: {
          name: newName.trim(),
          actorId: newActorId.trim(),
          secretRef: newSecretRef.trim(),
          autoRecord: newAutoRecord,
        },
      });
      setNewName("");
      setNewAutoRecord(false);
      toast.success("Đã tạo nguồn webhook tích hợp");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể tạo nguồn webhook.");
    } finally {
      setBusyKey("");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Tự động ghi sổ theo nguồn tích hợp (autoRecord)</CardTitle>
          <CardDescription>
            Khi bật <strong>autoRecord</strong> ở chế độ <strong>Doanh nghiệp một người</strong>,
            chi phí và hóa đơn đủ điều kiện gửi từ token tích hợp (n8n/API) hoặc webhook được ghi sổ
            nguyên tử ngay khi nhập và lưu vết dưới danh tính tích hợp (không cần cấp token owner).
            Bản ghi chưa đủ điều kiện sẽ giữ ở trạng thái nháp kèm lý do rõ ràng.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {overview && overview.operatingMode !== "solopreneur" ? (
            <Alert>
              <AlertTitle>Đang ở chế độ kiểm soát (controlled)</AlertTitle>
              <AlertDescription>
                Cờ <code>autoRecord</code> được lưu cấu hình nhưng chỉ kích hoạt tự động ghi sổ khi
                tổ chức bật chế độ <strong>Doanh nghiệp một người</strong>.
              </AlertDescription>
            </Alert>
          ) : null}

          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Lỗi cấu hình nguồn tích hợp</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <>
              <div className="grid gap-2">
                <h3 className="text-sm font-semibold">Token API & Danh tính dịch vụ</h3>
                {overview?.apiCredentials.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Định danh</TableHead>
                        <TableHead>Actor</TableHead>
                        <TableHead>Vai trò</TableHead>
                        <TableHead>Trạng thái</TableHead>
                        <TableHead>Tự động ghi sổ</TableHead>
                        <TableHead className="text-right">Thao tác</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {overview.apiCredentials.map((cred) => (
                        <TableRow key={cred.id}>
                          <TableCell className="font-medium">{cred.name || cred.id}</TableCell>
                          <TableCell>{cred.actorId}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {cred.roles.map((role) => (
                                <Badge key={role} variant="outline">
                                  {role}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={cred.status === "active" ? "secondary" : "outline"}>
                              {cred.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {cred.isOwnerCredential ? (
                              <span className="text-xs text-muted-foreground">
                                Mặc định theo owner
                              </span>
                            ) : (
                              <Badge variant={cred.autoRecord ? "default" : "outline"}>
                                {cred.autoRecord ? "Đang bật" : "Đang tắt"}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {cred.isOwnerCredential ? null : (
                              <Button
                                type="button"
                                size="sm"
                                variant={cred.autoRecord ? "outline" : "default"}
                                disabled={busyKey !== "" || cred.status !== "active"}
                                onClick={() => void toggleCredential(cred)}
                              >
                                {busyKey === `cred:${cred.id}`
                                  ? "Đang lưu…"
                                  : cred.autoRecord
                                    ? "Tắt autoRecord"
                                    : "Bật autoRecord"}
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground">Chưa có token API nào.</p>
                )}
              </div>

              <div className="grid gap-3 border-t pt-4">
                <h3 className="text-sm font-semibold">Nguồn Webhook đầu vào (Paperless / n8n)</h3>
                {overview?.webhookSources.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tên nguồn</TableHead>
                        <TableHead>Public ID</TableHead>
                        <TableHead>Actor</TableHead>
                        <TableHead>Trạng thái</TableHead>
                        <TableHead>Tự động ghi sổ</TableHead>
                        <TableHead className="text-right">Thao tác</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {overview.webhookSources.map((src) => (
                        <TableRow key={src.id}>
                          <TableCell className="font-medium">{src.name}</TableCell>
                          <TableCell className="font-mono text-xs">{src.publicId}</TableCell>
                          <TableCell>{src.actorId}</TableCell>
                          <TableCell>
                            <Badge variant={src.status === "active" ? "secondary" : "outline"}>
                              {src.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={src.autoRecord ? "default" : "outline"}>
                              {src.autoRecord ? "Đang bật" : "Đang tắt"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              size="sm"
                              variant={src.autoRecord ? "outline" : "default"}
                              disabled={busyKey !== "" || src.status !== "active"}
                              onClick={() => void toggleWebhook(src)}
                            >
                              {busyKey === `wh:${src.id}`
                                ? "Đang lưu…"
                                : src.autoRecord
                                  ? "Tắt autoRecord"
                                  : "Bật autoRecord"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Chưa khai báo nguồn webhook đầu vào nào.
                  </p>
                )}

                <div className="rounded-lg border p-3">
                  <p className="mb-2 text-sm font-medium">Thêm nguồn webhook mới</p>
                  <FieldGroup className="grid gap-3 sm:grid-cols-3">
                    <Field>
                      <FieldLabel htmlFor="new-webhook-name">Tên nguồn</FieldLabel>
                      <Input
                        id="new-webhook-name"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Paperless OCR"
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="new-webhook-actor">Actor ID</FieldLabel>
                      <Input
                        id="new-webhook-actor"
                        value={newActorId}
                        onChange={(e) => setNewActorId(e.target.value)}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="new-webhook-secret">Biến môi trường HMAC</FieldLabel>
                      <Input
                        id="new-webhook-secret"
                        value={newSecretRef}
                        onChange={(e) => setNewSecretRef(e.target.value)}
                      />
                    </Field>
                  </FieldGroup>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <label
                      htmlFor="new-webhook-auto-record"
                      className="flex cursor-pointer items-center gap-2 text-sm"
                    >
                      <input
                        id="new-webhook-auto-record"
                        type="checkbox"
                        className="size-4 accent-current"
                        checked={newAutoRecord}
                        onChange={(e) => setNewAutoRecord(e.target.checked)}
                      />
                      <span>Bật tự động ghi sổ (autoRecord) ngay khi tạo</span>
                    </label>
                    <Button
                      type="button"
                      size="sm"
                      disabled={
                        busyKey !== "" ||
                        !newName.trim() ||
                        !newActorId.trim() ||
                        !newSecretRef.trim()
                      }
                      onClick={() => void createWebhookSource()}
                    >
                      {busyKey === "create-webhook" ? "Đang tạo…" : "Tạo nguồn webhook"}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
