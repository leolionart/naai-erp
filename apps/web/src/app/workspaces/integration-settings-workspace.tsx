"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthenticatedApiClient } from "@/lib/api";
import {
  ConfirmIntegrationActionDialog,
  CreateServiceKeyDialog,
  CreateWebhookDialog,
  IssuedSecretBanner,
  type CreateServiceKeyInput,
  type CreateWebhookInput,
  type IssuedSecretInfo,
  type PendingIntegrationAction,
} from "./integration-settings-dialogs";
import {
  ServiceKeysCard,
  WebhookSourcesCard,
  type ApiCredentialItem,
  type WebhookSourceItem,
} from "./integration-settings-tables";

type IntegrationOverview = Readonly<{
  operatingMode: "controlled" | "solopreneur";
  webhookSources: readonly WebhookSourceItem[];
  apiCredentials: readonly ApiCredentialItem[];
}>;
type IssuedCredentialResponse = Readonly<{ secretToken: string; credential?: ApiCredentialItem }>;
type IssuedWebhookResponse = Readonly<{
  signingSecret?: string;
  publicId?: string;
  source?: WebhookSourceItem;
}>;

export function IntegrationAutoRecordSection() {
  const { client, hydrated, hasToken } = useAuthenticatedApiClient();
  const [overview, setOverview] = useState<IntegrationOverview>();
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");
  const [issuedSecret, setIssuedSecret] = useState<IssuedSecretInfo | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingIntegrationAction | null>(null);

  const load = useCallback(async () => {
    if (!hydrated) return;
    if (!hasToken) {
      setError("Cần phiên đăng nhập hợp lệ để quản lý kết nối tích hợp.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      setOverview(await client.data<IntegrationOverview>("integration-sources"));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Không thể tải danh sách kết nối tích hợp.",
      );
    } finally {
      setLoading(false);
    }
  }, [client, hasToken, hydrated]);

  useEffect(() => void load(), [load]);

  const externalCredentials = (overview?.apiCredentials ?? []).filter((c) => !c.isOwnerCredential);
  const webhookSources = overview?.webhookSources ?? [];
  const activeKeys = externalCredentials.filter((c) => c.status === "active").length;
  const activeWebhooks = webhookSources.filter((w) => w.status === "active").length;
  const activeAutoRecord =
    externalCredentials.filter((c) => c.status === "active" && c.autoRecord).length +
    webhookSources.filter((w) => w.status === "active" && w.autoRecord).length;

  function applyWebhookSecret(
    label: string,
    res: IssuedWebhookResponse,
    fallbackPublicId?: string,
  ) {
    const publicId = res.source?.publicId ?? res.publicId ?? fallbackPublicId;
    if (!res.signingSecret) return;
    setIssuedSecret({
      kind: "webhook_secret",
      label,
      secret: res.signingSecret,
      ...(publicId ? { webhookUrl: `/api/v1/webhooks/inbound/${publicId}` } : {}),
    });
  }

  async function handleCreateServiceKey(input: CreateServiceKeyInput) {
    setError("");
    const res = await client.data<IssuedCredentialResponse>("api-credentials", {
      method: "POST",
      body: {
        name: input.name,
        roles: [input.role],
        ...(input.actorId ? { actorId: input.actorId } : {}),
        autoRecord: input.autoRecord,
      },
    });
    setIssuedSecret({ kind: "service_key", label: input.name, secret: res.secretToken });
    toast.success(`Đã tạo khóa kết nối "${input.name}"`);
    await load();
  }

  async function handleCreateWebhook(input: CreateWebhookInput) {
    setError("");
    const res = await client.data<IssuedWebhookResponse>("integration-sources", {
      method: "POST",
      body: {
        name: input.name,
        ...(input.actorId ? { actorId: input.actorId } : {}),
        autoRecord: input.autoRecord,
      },
    });
    applyWebhookSecret(input.name, res);
    toast.success(`Đã tạo nguồn Webhook "${input.name}"`);
    await load();
  }

  async function toggleAutoRecord(
    resource: "api-credentials" | "integration-sources",
    id: string,
    version: string,
    current: boolean,
    label: string,
  ) {
    setBusyKey(`${resource}:${id}`);
    setError("");
    try {
      const reason = !current
        ? `Bật tự động ghi sổ cho ${label}`
        : `Tắt tự động ghi sổ cho ${label}`;
      await client.data(`${resource}/${encodeURIComponent(id)}`, {
        method: "PATCH",
        expectedVersion: version,
        body: { autoRecord: !current, reason },
      });
      toast.success(
        !current ? `Đã bật tự động ghi sổ cho ${label}` : `Đã tắt tự động ghi sổ cho ${label}`,
      );
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể cập nhật cờ tự động ghi sổ.");
    } finally {
      setBusyKey("");
    }
  }

  async function executeConfirmedAction(action: PendingIntegrationAction) {
    setBusyKey(`${action.kind}:${action.id}`);
    setError("");
    const id = encodeURIComponent(action.id);
    try {
      if (action.kind === "rotate_key") {
        const res = await client.data<IssuedCredentialResponse>(`api-credentials/${id}/rotate`, {
          method: "POST",
          expectedVersion: action.version,
          body: { reason: "Cấp lại khóa kết nối dịch vụ" },
        });
        setIssuedSecret({ kind: "service_key", label: action.label, secret: res.secretToken });
        toast.success(`Đã cấp lại khóa cho "${action.label}"`);
      } else if (action.kind === "revoke_key") {
        await client.data(`api-credentials/${id}`, {
          method: "PATCH",
          expectedVersion: action.version,
          body: { status: "revoked", reason: "Thu hồi khóa kết nối dịch vụ" },
        });
        toast.success(`Đã thu hồi khóa "${action.label}"`);
      } else if (action.kind === "rotate_webhook") {
        const res = await client.data<IssuedWebhookResponse>(
          `integration-sources/${id}/rotate-secret`,
          {
            method: "POST",
            expectedVersion: action.version,
            body: { reason: "Cấp lại secret nguồn webhook" },
          },
        );
        applyWebhookSecret(action.label, res, action.publicId);
        toast.success(`Đã cấp lại secret cho "${action.label}"`);
      } else {
        await client.data(`integration-sources/${id}`, {
          method: "PATCH",
          expectedVersion: action.version,
          body: { status: "revoked", reason: "Thu hồi nguồn webhook" },
        });
        toast.success(`Đã thu hồi nguồn Webhook "${action.label}"`);
      }
      setPendingAction(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể thực hiện thao tác.");
    } finally {
      setBusyKey("");
    }
  }

  async function copyEndpoint(endpointPath: string) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    await navigator.clipboard.writeText(`${origin}${endpointPath}`);
    toast.success("Đã sao chép địa chỉ Webhook.");
  }

  const kpiItems = [
    [
      "Chế độ vận hành",
      overview?.operatingMode === "solopreneur"
        ? "Doanh nghiệp một người"
        : "Kiểm soát (Maker-Checker)",
    ],
    ["Khóa kết nối dịch vụ", `${activeKeys} đang hoạt động`],
    ["Nguồn Webhook đầu vào", `${activeWebhooks} đang hoạt động`],
    ["Tự động ghi sổ (autoRecord)", `${activeAutoRecord} kết nối đang bật`],
  ] as const;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading && !overview
          ? Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))
          : kpiItems.map(([label, value]) => (
              <Card key={label} size="sm">
                <CardHeader>
                  <CardDescription>{label}</CardDescription>
                  <CardTitle>{value}</CardTitle>
                </CardHeader>
              </Card>
            ))}
      </div>

      {issuedSecret ? (
        <IssuedSecretBanner issued={issuedSecret} onDismiss={() => setIssuedSecret(null)} />
      ) : null}

      {overview && overview.operatingMode !== "solopreneur" ? (
        <Alert>
          <AlertTitle>Đang ở chế độ Kiểm soát (Maker-Checker)</AlertTitle>
          <AlertDescription>
            Cờ <code>autoRecord</code> vẫn được lưu trên từng kết nối nhưng chỉ tự động ghi sổ khi
            tổ chức vận hành ở chế độ <strong>Doanh nghiệp một người</strong>.
          </AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Lỗi cấu hình kết nối tích hợp</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <ServiceKeysCard
        items={externalCredentials}
        loading={loading && !overview}
        busy={busyKey !== ""}
        action={<CreateServiceKeyDialog onCreate={handleCreateServiceKey} />}
        onToggleAutoRecord={(cred, label) =>
          void toggleAutoRecord("api-credentials", cred.id, cred.version, cred.autoRecord, label)
        }
        onRequestAction={setPendingAction}
      />

      <WebhookSourcesCard
        items={webhookSources}
        loading={loading && !overview}
        busy={busyKey !== ""}
        action={<CreateWebhookDialog onCreate={handleCreateWebhook} />}
        onCopyEndpoint={(endpoint) => void copyEndpoint(endpoint)}
        onToggleAutoRecord={(src) =>
          void toggleAutoRecord(
            "integration-sources",
            src.id,
            src.version,
            src.autoRecord,
            src.name,
          )
        }
        onRequestAction={setPendingAction}
      />

      <ConfirmIntegrationActionDialog
        action={pendingAction}
        busy={busyKey !== ""}
        onCancel={() => setPendingAction(null)}
        onConfirm={executeConfirmedAction}
      />
    </div>
  );
}
