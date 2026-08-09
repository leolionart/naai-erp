"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthenticatedApiClient } from "@/lib/api";

type Mode = "controlled" | "owner_final";
type WorkflowPolicy = Readonly<{
  organizationId: string;
  operatingMode: Mode;
}>;

function resourceKey(organizationId: string) {
  return btoa(JSON.stringify({ organization_id: organizationId }))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

export function OwnerFinalPolicyWorkspace() {
  const { client, hydrated, hasToken } = useAuthenticatedApiClient();
  const [policy, setPolicy] = useState<WorkflowPolicy>();
  const [mode, setMode] = useState<Mode>("controlled");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!hydrated) return;
    if (!hasToken) {
      setError("Cần API token để quản lý chế độ vận hành.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const payload = await client.data<{ items?: readonly Record<string, unknown>[] }>(
        "master-data/accounting-workflow-policy?limit=1",
      );
      const row = payload.items?.[0];
      if (!row) {
        setPolicy(undefined);
        setMode("controlled");
        return;
      }
      const next = {
        organizationId: String(row.organization_id ?? row.organizationId ?? ""),
        operatingMode: String(row.operating_mode ?? row.operatingMode ?? "controlled") as Mode,
      };
      setPolicy(next);
      setMode(next.operatingMode);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể tải chế độ vận hành.");
    } finally {
      setLoading(false);
    }
  }, [client, hasToken, hydrated]);

  useEffect(() => void load(), [load]);

  async function save() {
    setBusy(true);
    setError("");
    try {
      await client.data(
        policy
          ? `master-data/accounting-workflow-policy/${resourceKey(policy.organizationId)}`
          : "master-data/accounting-workflow-policy",
        {
          method: policy ? "PATCH" : "POST",
          body: {
            data: policy
              ? { operating_mode: mode }
              : {
                  operating_mode: mode,
                  allow_self_approval: false,
                  self_approval_max_minor: null,
                  soft_lock_posting_roles: ["owner", "finance_admin"],
                },
          },
        },
      );
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể lưu chế độ vận hành.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Chế độ vận hành chi phí</CardTitle>
        <CardDescription>
          Owner-final dành cho doanh nghiệp một người: chi phí có chứng từ được ghi nhận là đã xác
          nhận quản trị và thuế ngay khi nhập. Chi cá nhân, thiếu chứng từ và tài sản vẫn theo quy
          tắc riêng.
        </CardDescription>
        <CardAction>
          <Button
            size="sm"
            onClick={save}
            disabled={loading || busy || mode === policy?.operatingMode}
          >
            {busy ? "Đang lưu…" : "Lưu chế độ"}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {error ? (
          <Alert variant="destructive" className="mb-4">
            <AlertTitle>Không thể cập nhật cấu hình</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {loading ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <Select value={mode} onValueChange={(value) => setMode(value as Mode)}>
            <SelectTrigger aria-label="Chế độ vận hành chi phí" className="w-full sm:w-80">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="controlled">Kiểm soát nhiều bước</SelectItem>
                <SelectItem value="owner_final">Một chủ sở hữu — dữ liệu nhập là final</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
      </CardContent>
    </Card>
  );
}
