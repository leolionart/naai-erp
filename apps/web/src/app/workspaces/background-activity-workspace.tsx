"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCwIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  const [eventType, setEventType] = useState("");
  const [source, setSource] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [loadingMore, setLoadingMore] = useState(false);
  const logViewportRef = useRef<HTMLDivElement>(null);
  const nextCursorRef = useRef<string | undefined>(undefined);

  const load = useCallback(
    async (append = false) => {
      if (!hydrated) return;
      if (append) setLoadingMore(true);
      else setLoading(true);
      if (!append) nextCursorRef.current = undefined;
      setError("");
      if (!hasToken) {
        setPage(undefined);
        setError("AUTH_REQUIRED");
        setLoading(false);
        setLoadingMore(false);
        return;
      }
      try {
        const currentCursor = append ? nextCursorRef.current : undefined;
        if (append && !currentCursor) {
          setLoadingMore(false);
          return;
        }
        const next = await client.data<OperationalLogPage>(
          operationalLogsApi.listAll({
            status,
            eventType,
            source,
            limit: 100,
            cursor: currentCursor,
          }),
        );
        setPage((previous) => {
          if (!append || !previous) return next;
          const seen = new Set(previous.items.map((item) => item.id));
          return {
            ...next,
            items: [...previous.items, ...next.items.filter((item) => !seen.has(item.id))],
          };
        });
        nextCursorRef.current = next.nextCursor ?? undefined;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Không thể tải nhật ký chạy ngầm.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [client, eventType, hasToken, hydrated, source, status],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const timelineFor = useMemo(
    () => (item: OperationalLog) => {
      const details = item.details;
      if (!details || typeof details !== "object") return [] as readonly Record<string, unknown>[];
      const candidate = details as Record<string, unknown>;
      const events = candidate.events ?? candidate.timeline ?? candidate.steps ?? candidate.logs;
      if (!Array.isArray(events)) return [] as readonly Record<string, unknown>[];
      return events.filter((event): event is Record<string, unknown> =>
        Boolean(event && typeof event === "object"),
      );
    },
    [],
  );

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
        <CardHeader className="!flex !flex-row flex-wrap items-start justify-between gap-3 border-b">
          <div>
            <CardTitle>Nhật ký hoạt động</CardTitle>
            <CardDescription>
              Theo dõi thao tác nghiệp vụ, API, hệ thống và tiến trình nền trong một dòng thời gian.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-auto shrink-0"
            onClick={() => void load()}
            disabled={loading || loadingMore}
          >
            {loading ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <RefreshCwIcon data-icon="inline-start" />
            )}
            Tải lại log
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="activity-source">Nguồn hoạt động</FieldLabel>
              <Select
                value={source || "__all"}
                onValueChange={(value) => setSource(value === "__all" ? "" : value)}
              >
                <SelectTrigger id="activity-source" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">Tất cả nguồn</SelectItem>
                  <SelectItem value="operational">Vận hành</SelectItem>
                  <SelectItem value="resource_audit">Nghiệp vụ/API</SelectItem>
                  <SelectItem value="planning_audit">Kế hoạch</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="activity-status">Trạng thái</FieldLabel>
              <Select
                value={status || "__all"}
                onValueChange={(value) => setStatus(value === "__all" ? "" : value)}
              >
                <SelectTrigger id="activity-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">Tất cả trạng thái</SelectItem>
                  <SelectItem value="running">Đang chạy</SelectItem>
                  <SelectItem value="succeeded">Thành công</SelectItem>
                  <SelectItem value="failed">Thất bại</SelectItem>
                  <SelectItem value="cancelled">Đã hủy</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="activity-kind">Loại hoạt động</FieldLabel>
              <Input
                id="activity-kind"
                placeholder="Ví dụ: create, update, outbound_delivery"
                value={eventType}
                onChange={(event) => setEventType(event.target.value)}
              />
            </Field>
          </div>
          <div
            ref={logViewportRef}
            onScroll={(event) => {
              const target = event.currentTarget;
              if (
                target.scrollTop + target.clientHeight >= target.scrollHeight - 160 &&
                nextCursorRef.current &&
                !loadingMore
              ) {
                void load(true);
              }
            }}
            className="max-h-[70vh] overflow-y-auto rounded-lg border bg-slate-950 text-slate-100 shadow-inner"
            aria-live="polite"
          >
            {loading ? (
              <div className="px-4 py-8 text-center font-mono text-sm text-slate-400">
                Đang tải log…
              </div>
            ) : null}
            {!loading && error ? (
              <div className="px-4 py-8 font-mono text-sm text-red-300">[error] {error}</div>
            ) : null}
            {!loading && !error && (page?.items ?? []).length === 0 ? (
              <div className="px-4 py-8 text-center font-mono text-sm text-slate-400">
                Chưa có log.
              </div>
            ) : null}
            {!loading && !error
              ? (page?.items ?? []).map((item) => {
                  const timeline = timelineFor(item);
                  const isFailed = item.status === "failed";
                  return (
                    <div
                      className="border-b border-slate-800 px-4 py-3 last:border-b-0"
                      key={item.id}
                    >
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-xs leading-relaxed">
                        <span className="shrink-0 text-slate-500">
                          {formatDateTime(item.occurred_at || item.started_at)}
                        </span>
                        <span
                          className={
                            isFailed
                              ? "text-red-400"
                              : item.status === "running"
                                ? "text-amber-300"
                                : "text-emerald-400"
                          }
                        >
                          [{item.status}]
                        </span>
                        <span className="font-semibold text-slate-100">
                          {item.source || item.service || "system"}
                        </span>
                        <span className="text-slate-300">
                          {item.event_type || item.operation || "activity"}
                        </span>
                        <span className="text-slate-400">
                          — {item.summary || (isFailed ? "Có lỗi khi xử lý" : "Hoàn tất")}
                        </span>
                        {item.worker_id ? (
                          <span className="text-slate-500">worker={item.worker_id}</span>
                        ) : null}
                        {item.completed_at ? (
                          <span className="text-slate-500">
                            duration=
                            {formatDuration(
                              Math.max(
                                0,
                                new Date(item.completed_at).valueOf() -
                                  new Date(item.started_at).valueOf(),
                              ),
                            )}
                          </span>
                        ) : null}
                        {timeline.length > 0 ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 font-sans text-xs text-slate-300 hover:bg-slate-800 hover:text-white"
                            aria-expanded={expanded.has(item.id)}
                            onClick={() =>
                              setExpanded((current) => {
                                const next = new Set(current);
                                if (next.has(item.id)) next.delete(item.id);
                                else next.add(item.id);
                                return next;
                              })
                            }
                          >
                            {expanded.has(item.id) ? "Ẩn trace" : `trace(${timeline.length})`}
                          </Button>
                        ) : null}
                      </div>
                      {expanded.has(item.id) ? (
                        <ol
                          className="mt-2 border-l border-slate-700 pl-4 font-mono text-xs text-slate-400"
                          aria-label="Chi tiết quá trình"
                        >
                          {timeline.map((event, index) => (
                            <li className="mb-1 last:mb-0" key={`${item.id}-event-${index}`}>
                              {formatDateTime(
                                String(
                                  event.occurredAt ?? event.occurred_at ?? event.timestamp ?? "",
                                ),
                              )}{" "}
                              {String(event.level ?? event.status ?? "info")} —{" "}
                              {String(
                                event.message ?? event.phase ?? event.step ?? `Bước ${index + 1}`,
                              )}
                            </li>
                          ))}
                        </ol>
                      ) : null}
                    </div>
                  );
                })
              : null}
            {!loading && !error && loadingMore ? (
              <div className="px-4 py-3 text-center font-mono text-xs text-slate-400">
                Đang tải thêm log…
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
