"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCwIcon } from "lucide-react";
import {
  FinancialDataTable,
  type FinancialColumn,
} from "@/components/financial/financial-data-table";
import { StatusBadge } from "@/components/financial/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  operationalLogsApi,
  useAuthenticatedApiClient,
  type OperationalLog,
  type OperationalLogPage,
} from "@/lib/api";

const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "medium",
});

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : dateTimeFormatter.format(date);
}

function formatDuration(value?: number | null) {
  if (value === null || value === undefined) return "—";
  if (value < 1_000) return `${value} ms`;
  if (value < 60_000) return `${(value / 1_000).toFixed(1)} giây`;
  return `${Math.floor(value / 60_000)} phút ${Math.round((value % 60_000) / 1_000)} giây`;
}

export function OperationalLogWorkspace() {
  const { client, hydrated, hasToken } = useAuthenticatedApiClient();
  const [page, setPage] = useState<OperationalLogPage>();
  const [status, setStatus] = useState("");
  const [service, setService] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!hydrated) return;
    setLoading(true);
    setError("");
    if (!hasToken) {
      setPage(undefined);
      setError("AUTH_REQUIRED");
      setLoading(false);
      return;
    }
    try {
      setPage(
        await client.data<OperationalLogPage>(
          operationalLogsApi.list({ status, service, limit: 100 }),
        ),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể tải nhật ký chạy ngầm.");
    } finally {
      setLoading(false);
    }
  }, [client, hasToken, hydrated, service, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: readonly FinancialColumn<OperationalLog>[] = [
    {
      id: "activity",
      header: "Hoạt động",
      cell: (item) => (
        <div className="flex min-w-52 flex-col gap-1">
          <strong>{item.summary || item.operation}</strong>
          <span className="font-mono text-xs text-muted-foreground">
            {item.service} · {item.operation}
          </span>
        </div>
      ),
    },
    { id: "status", header: "Trạng thái", cell: (item) => <StatusBadge status={item.status} /> },
    { id: "started", header: "Bắt đầu", cell: (item) => formatDateTime(item.started_at) },
    { id: "finished", header: "Kết thúc", cell: (item) => formatDateTime(item.completed_at) },
    {
      id: "duration",
      header: "Thời lượng",
      cell: (item) =>
        formatDuration(
          item.completed_at
            ? Math.max(
                0,
                new Date(item.completed_at).valueOf() - new Date(item.started_at).valueOf(),
              )
            : null,
        ),
    },
    {
      id: "attempt",
      header: "Lần chạy",
      cell: (item) => <Badge variant="outline">{item.worker_id || "—"}</Badge>,
    },
    {
      id: "detail",
      header: "Chi tiết",
      cell: (item) => (
        <div className="max-w-80 text-sm">
          {item.status === "failed" && item.details ? (
            <span className="text-destructive">
              {typeof item.details === "string" ? item.details : "Có lỗi khi xử lý"}
            </span>
          ) : (
            <span className="font-mono text-xs text-muted-foreground">
              {item.correlation_id || item.id}
            </span>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Alert>
        <AlertTitle>Chính sách lưu nhật ký</AlertTitle>
        <AlertDescription>
          Nhật ký vận hành được tự động xóa sau {30} ngày để tránh tăng dung lượng lưu trữ. Nhật ký
          kiểm toán và dữ liệu kế toán không bị xóa theo chính sách này.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="flex-row flex-wrap items-end justify-between gap-4">
          <div>
            <CardTitle>Hoạt động chạy ngầm</CardTitle>
            <CardDescription>
              Theo dõi tiến trình, lần thử lại và lỗi đã được làm sạch thông tin nhạy cảm.
            </CardDescription>
          </div>
          <Button onClick={() => void load()} disabled={loading}>
            {loading ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <RefreshCwIcon data-icon="inline-start" />
            )}
            Tải lại
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="activity-status">Trạng thái</FieldLabel>
              <select
                id="activity-status"
                className="h-9 rounded-md border bg-background px-3 text-sm"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="">Tất cả trạng thái</option>
                <option value="running">Đang chạy</option>
                <option value="succeeded">Thành công</option>
                <option value="failed">Thất bại</option>
                <option value="cancelled">Đã hủy</option>
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="activity-kind">Loại hoạt động</FieldLabel>
              <Input
                id="activity-kind"
                placeholder="Ví dụ: outbound-delivery"
                value={service}
                onChange={(event) => setService(event.target.value)}
              />
            </Field>
          </div>
          <FinancialDataTable
            rows={page?.items ?? []}
            columns={columns}
            rowKey={(item) => item.id}
            loading={loading}
            error={error}
            emptyTitle="Chưa có hoạt động chạy ngầm"
            emptyDescription="Các tác vụ nền sẽ xuất hiện tại đây khi hệ thống xử lý."
          />
        </CardContent>
      </Card>
    </div>
  );
}
