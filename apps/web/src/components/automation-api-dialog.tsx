"use client";

import { ClipboardIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthenticatedApiClient } from "@/lib/api";

export type AiDiscoveryEndpoints = Readonly<{
  organizationApiBase: string;
  capabilitiesUrl: string;
  openApiUrl: string;
  inboundWebhookTemplate: string;
  cliCommands: readonly [string, string, string];
}>;

export function buildAiDiscoveryEndpoints(
  baseUrl: string,
  organizationId: string,
): AiDiscoveryEndpoints {
  const cleanBase = baseUrl.trim().replace(/\/+$/, "");
  const cleanOrg = organizationId.trim();
  return {
    organizationApiBase: `${cleanBase}/api/v1/organizations/${encodeURIComponent(cleanOrg)}`,
    capabilitiesUrl: `${cleanBase}/api/v1/capabilities`,
    openApiUrl: `${cleanBase}/api/v1/openapi.json`,
    inboundWebhookTemplate: `${cleanBase}/api/v1/webhooks/inbound/{publicId}`,
    cliCommands: [
      "naai-erp discovery capabilities",
      "naai-erp discovery describe --key expenses",
      "naai-erp discovery openapi --tag expenses",
    ],
  };
}

export function AiNativeDiscoveryCard() {
  const { connection } = useAuthenticatedApiClient();
  const originFallback =
    typeof window !== "undefined" ? window.location.origin : "http://localhost:3001";
  const resolvedBaseUrl = connection.baseUrl.replace(/\/dev-api\/?$/, "") || originFallback;
  const organizationId = connection.organizationId || "naai";
  const endpoints = buildAiDiscoveryEndpoints(resolvedBaseUrl, organizationId);

  async function copyValue(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    toast.success(`Đã sao chép ${label}.`);
  }

  const rows = [
    {
      key: "org-id",
      label: "Organization ID",
      display: organizationId,
      copyText: organizationId,
    },
    {
      key: "capabilities",
      label: "Capabilities URL",
      display: endpoints.capabilitiesUrl,
      copyText: endpoints.capabilitiesUrl,
    },
    {
      key: "openapi",
      label: "OpenAPI 3.1 Spec",
      display: endpoints.openApiUrl,
      copyText: endpoints.openApiUrl,
    },
    {
      key: "cli",
      label: "CLI Khám phá nhanh",
      display: `${endpoints.cliCommands[0]} · ${endpoints.cliCommands[1]}`,
      copyText: endpoints.cliCommands.join("\n"),
    },
  ] as const;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tự khám phá hợp đồng máy (AI-Native Discovery)</CardTitle>
        <CardDescription>
          Cung cấp các điểm truy cập chuẩn dưới đây cùng một Khóa kết nối dịch vụ (naai_sk_...) cho
          AI Agent, CLI hoặc n8n để máy tự tra cứu schema và nghiệp vụ trực tiếp từ hệ thống — không
          cần chép mẫu cURL thủ công.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-3 md:grid-cols-2">
        {rows.map((row) => (
          <div
            key={row.key}
            className="flex min-w-0 flex-col justify-between gap-2 rounded-xl border bg-muted/20 p-3 sm:flex-row sm:items-center"
          >
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-foreground">{row.label}</p>
              <code className="mt-1 block min-w-0 break-all font-mono text-xs text-muted-foreground">
                {row.display}
              </code>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 self-start sm:self-center"
              aria-label={`Sao chép ${row.label}`}
              onClick={() => void copyValue(row.copyText, row.label)}
            >
              <ClipboardIcon data-icon="inline-start" />
              Sao chép
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
