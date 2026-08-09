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

export type BusinessMode = "controlled" | "solopreneur";

type WorkflowPolicy = Readonly<{
  organizationId: string;
  businessMode: BusinessMode;
}>;

function resourceKey(organizationId: string) {
  return btoa(JSON.stringify({ organization_id: organizationId }))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

export function BusinessModeWorkspace() {
  const { client, hydrated, hasToken } = useAuthenticatedApiClient();
  const [policy, setPolicy] = useState<WorkflowPolicy>();
  const [mode, setMode] = useState<BusinessMode>("controlled");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!hydrated) return;
    if (!hasToken) {
      setError("Cần API token để quản lý mô hình doanh nghiệp.");
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
        businessMode: String(
          row.operating_mode ?? row.operatingMode ?? "controlled",
        ) as BusinessMode,
      };
      setPolicy(next);
      setMode(next.businessMode);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể tải mô hình doanh nghiệp.");
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
              ? {
                  operating_mode: mode,
                  allow_self_approval: false,
                  self_approval_max_minor: null,
                }
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
      setError(cause instanceof Error ? cause.message : "Không thể lưu mô hình doanh nghiệp.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mô hình doanh nghiệp</CardTitle>
        <CardDescription>
          Doanh nghiệp một người cho phép chủ doanh nghiệp tự khai báo và tự duyệt nghiệp vụ; mọi
          thao tác vẫn được phân quyền, lưu vết và kiểm tra theo quy tắc kế toán. Dữ liệu thiếu
          chứng từ hoặc có ngoại lệ vẫn phải được rà soát.
        </CardDescription>
        <CardAction>
          <Button
            size="sm"
            onClick={save}
            disabled={loading || busy || mode === policy?.businessMode}
          >
            {busy ? "Đang lưu…" : "Lưu mô hình"}
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
          <Select value={mode} onValueChange={(value) => setMode(value as BusinessMode)}>
            <SelectTrigger aria-label="Mô hình doanh nghiệp" className="w-full sm:w-80">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="controlled">Doanh nghiệp có phân quyền</SelectItem>
                <SelectItem value="solopreneur">Doanh nghiệp một người</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
      </CardContent>
    </Card>
  );
}
