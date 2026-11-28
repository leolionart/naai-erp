"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ModulePage } from "@/components/layout/module-page";
import { useAuthenticatedApiClient } from "@/lib/api";
import { cn } from "@/lib/utils";

type SwitchKey = "enabled" | "notifyRevenue" | "notifyDrafts" | "notifyExpense";
type DeliveryStats = Readonly<
  Record<"sentLast7Days" | "pending" | "failed", number> &
    Record<"lastSentAt" | "lastError", string | null>
>;
type TelegramSettings = Readonly<
  Record<SwitchKey | "hasBotToken", boolean> &
    Record<"chatId" | "botTokenHint" | "updatedAt", string | null> & {
      threadId: number | null;
      version: string;
      delivery?: DeliveryStats;
    }
>;
type TestResult = Readonly<{ ok: boolean; status: number; error?: string }>;
type FormDraft = Record<SwitchKey, boolean> & Record<"botToken" | "chatId" | "threadId", string>;

const PATH = "telegram-settings";
const REV_DESC = "Khi hóa đơn bán hàng hoặc bút toán doanh thu được ghi sổ.";
const DRAFT_DESC =
  "Thông báo ngay khi hóa đơn/chi phí được thêm dưới dạng bản nháp (ví dụ qua API hoặc n8n), chưa cần ghi sổ.";
const SWITCH_ITEMS: ReadonlyArray<[string, SwitchKey, string, string]> = [
  ["telegram-enabled", "enabled", "Bật thông báo Telegram", "Cần có bot token và Chat ID."],
  ["telegram-revenue", "notifyRevenue", "Doanh thu", REV_DESC],
  ["telegram-drafts", "notifyDrafts", "Cả bản nháp", DRAFT_DESC],
  ["telegram-expense", "notifyExpense", "Chi phí", "Khi chi phí hoặc hóa đơn mua vào được ghi sổ."],
];

const toDraft = (s?: TelegramSettings): FormDraft => ({
  enabled: s?.enabled ?? false,
  notifyRevenue: s?.notifyRevenue ?? true,
  notifyExpense: s?.notifyExpense ?? true,
  notifyDrafts: s?.notifyDrafts ?? true,
  botToken: "",
  chatId: s?.chatId ?? "",
  threadId: s?.threadId == null ? "" : String(s.threadId),
});

const Notice = (p: { v?: "default" | "destructive"; t: string; children: ReactNode }) => (
  <Alert variant={p.v}>
    <AlertTitle>{p.t}</AlertTitle>
    <AlertDescription>{p.children}</AlertDescription>
  </Alert>
);

export function describeTelegramFailureState(delivery?: DeliveryStats) {
  const failed = delivery?.failed ?? 0;
  const activeError = delivery?.lastError?.trim() ? delivery.lastError : null;
  if (activeError) {
    return {
      failed,
      activeError,
      badge: ["Cần kiểm tra", "destructive"] as const,
      subtitle: "Xem chi tiết lỗi bên dưới",
    };
  }
  if (failed > 0) {
    return {
      failed,
      activeError: null,
      badge: ["Đã phục hồi", "secondary"] as const,
      subtitle: "Lỗi cũ đã qua, hiện gửi bình thường",
    };
  }
  return {
    failed: 0,
    activeError: null,
    badge: ["Ổn định", "secondary"] as const,
    subtitle: "Không có lỗi gửi",
  };
}

export function TelegramSettingsWorkspace() {
  const { client, hasToken, hydrated } = useAuthenticatedApiClient();
  const [saved, setSaved] = useState<TelegramSettings>();
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [form, setForm] = useState<FormDraft>(() => toDraft());
  const [busy, setBusy] = useState<"" | "save" | "test">("");
  const [error, setError] = useState("");
  const [testResult, setTestResult] = useState<TestResult>();

  const apply = useCallback((s: TelegramSettings) => {
    setSaved(s);
    setForm(toDraft(s));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!hasToken) return void setLoadingInitial(false);
    let active = true;
    setLoadingInitial(true);
    client
      .data<TelegramSettings>(PATH)
      .then((s) => active && apply(s))
      .catch((c: unknown) => active && setError(c instanceof Error ? c.message : String(c)))
      .finally(() => active && setLoadingInitial(false));
    return () => {
      active = false;
    };
  }, [apply, client, hasToken, hydrated]);

  async function save() {
    setBusy("save");
    setError("");
    setTestResult(undefined);
    try {
      const { botToken, chatId, threadId, ...flags } = form;
      const trimmedThread = threadId.trim();
      const result = await client.data<TelegramSettings>(PATH, {
        method: "PATCH",
        body: {
          ...flags,
          chatId: chatId.trim() || undefined,
          threadId: trimmedThread ? Number(trimmedThread) : null,
          ...(botToken.trim() ? { botToken: botToken.trim() } : {}),
        },
      });
      apply(result);
      toast.success("Đã lưu cấu hình thông báo Telegram");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy("");
    }
  }

  async function sendTest() {
    setBusy("test");
    setError("");
    try {
      const res = await client.data<TestResult>(`${PATH}/test`, { method: "POST", body: {} });
      setTestResult(res);
      if (res.ok) {
        setSaved((prev) =>
          prev?.delivery ? { ...prev, delivery: { ...prev.delivery, lastError: null } } : prev,
        );
        toast.success("Đã gửi tin nhắn thử tới Telegram");
      } else toast.error(`${res.error ?? "Không rõ lỗi"} (HTTP ${res.status})`);
    } catch (cause) {
      const msg = cause instanceof Error ? cause.message : String(cause);
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy("");
    }
  }

  const dirty =
    !saved ||
    SWITCH_ITEMS.some(([, k]) => form[k] !== saved[k]) ||
    form.chatId.trim() !== (saved.chatId ?? "") ||
    form.threadId.trim() !== (saved.threadId === null ? "" : String(saved.threadId)) ||
    form.botToken.trim() !== "";

  const sent = saved?.delivery?.sentLast7Days ?? 0;
  const pending = saved?.delivery?.pending ?? 0;
  const failureState = describeTelegramFailureState(saved?.delivery);
  const failed = failureState.failed;
  const statusLabel = saved?.enabled ? "Đang bật" : "Đang tắt";
  const hint = saved?.botTokenHint ?? "****";
  const tokenSub = saved?.hasBotToken ? `Token đã lưu (…${hint})` : "Chưa cấu hình bot token";
  const lastAt = saved?.delivery?.lastSentAt;
  const sentSub = lastAt
    ? `Gần nhất: ${new Date(lastAt).toLocaleString("vi-VN")}`
    : "Chưa phát sinh tin gửi";
  const tokenPh = saved?.hasBotToken
    ? `Đã lưu (…${hint}) — để trống để giữ nguyên`
    : "123456789:AA…";
  const topicPh = "Chỉ cần với nhóm có bật Topics";
  const botBadge = [statusLabel, saved?.enabled ? "default" : "secondary"] as const;
  const kpis = [
    ["Trạng thái bot", statusLabel, tokenSub, botBadge] as const,
    ["Đã gửi (7 ngày qua)", sent, sentSub, undefined] as const,
    ["Đang chờ gửi", pending, "Hàng đợi worker outbox", undefined] as const,
    ["Lỗi gửi (7 ngày qua)", failed, failureState.subtitle, failureState.badge] as const,
  ];
  const inputs = [
    ["telegram-bot-token", "Bot token", "botToken", tokenPh, "password"],
    ["telegram-chat-id", "Chat ID", "chatId", "-1001234567890 hoặc @tenkenh", "text"],
    ["telegram-thread-id", "Topic ID (tùy chọn)", "threadId", topicPh, "numeric"],
  ] as const;
  const setText = (k: "botToken" | "chatId" | "threadId", v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <ModulePage
      title="Thông báo Telegram"
      description="Nhận tin nhắn Telegram mỗi khi có doanh thu hoặc chi phí được ghi sổ."
      section="Cấu hình & Vận hành"
    >
      {!hydrated || (hasToken && loadingInitial) ? (
        <div className="flex flex-col gap-6" aria-busy="true">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Skeleton className="h-96 w-full rounded-xl" />
            <Skeleton className="h-96 w-full rounded-xl" />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {kpis.map(([title, value, sub, badge]) => (
              <Card key={title} size="sm">
                <CardHeader>
                  <CardDescription>{title}</CardDescription>
                  {badge ? (
                    <CardAction>
                      <Badge variant={badge[1]}>{badge[0]}</Badge>
                    </CardAction>
                  ) : null}
                </CardHeader>
                <CardContent className="flex flex-col gap-1">
                  <div className="text-2xl font-semibold tabular-nums">{value}</div>
                  <p className="text-xs text-muted-foreground">{sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {error ? (
            <Notice v="destructive" t="Không thực hiện được">
              {error}
            </Notice>
          ) : null}
          {failureState.activeError ? (
            <Notice v="destructive" t="Lỗi gửi gần nhất từ worker">
              {failureState.activeError} — Hãy kiểm tra lại Bot token, Chat ID và bấm &ldquo;Gửi tin
              nhắn thử&rdquo; để xác minh kết nối.
            </Notice>
          ) : null}
          {saved?.enabled && saved.delivery && sent === 0 && failed === 0 ? (
            <Notice t="Chưa ghi nhận tin nhắn gửi đi">
              Hãy thử bấm &ldquo;Gửi tin nhắn thử&rdquo; và kiểm tra worker đang chạy với biến môi
              trường <code>SESSION_SECRET</code> khớp với dịch vụ API.
            </Notice>
          ) : null}
          {testResult ? (
            <Notice
              v={testResult.ok ? "default" : "destructive"}
              t={testResult.ok ? "Gửi thử thành công" : "Gửi thử thất bại"}
            >
              {testResult.ok
                ? "Kiểm tra Telegram để thấy tin nhắn thử."
                : `${testResult.error ?? "Không rõ lỗi"} (HTTP ${testResult.status})`}
            </Notice>
          ) : null}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (dirty && hasToken && busy === "") void save();
            }}
            className="grid gap-6 lg:grid-cols-2"
          >
            <Card className="flex flex-col justify-between">
              <CardHeader>
                <CardTitle>Kết nối bot</CardTitle>
                <CardAction>
                  <Badge variant={saved?.enabled ? "default" : "secondary"}>{statusLabel}</Badge>
                </CardAction>
                <CardDescription>
                  Tạo bot với @BotFather, thêm bot vào nhóm hoặc kênh nhận tin rồi nhập Bot token và
                  Chat ID. Token được mã hóa và không bao giờ hiển thị lại.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <FieldGroup>
                  {inputs.map(([id, label, key, placeholder, mode]) => (
                    <Field key={id}>
                      <FieldLabel htmlFor={id}>{label}</FieldLabel>
                      <Input
                        id={id}
                        type={mode === "password" ? "password" : undefined}
                        autoComplete={mode === "password" ? "off" : undefined}
                        inputMode={mode === "numeric" ? "numeric" : undefined}
                        placeholder={placeholder}
                        value={form[key]}
                        onChange={(e) =>
                          setText(
                            key,
                            mode === "numeric" ? e.target.value.replace(/\D/g, "") : e.target.value,
                          )
                        }
                      />
                    </Field>
                  ))}
                </FieldGroup>
              </CardContent>
            </Card>

            <Card className="flex flex-col justify-between">
              <CardHeader>
                <CardTitle>Loại thông báo</CardTitle>
                <CardDescription>
                  Chỉ các bút toán phát sinh sau thời điểm bật mới được gửi; dữ liệu lịch sử không
                  bị gửi lại.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3">
                {SWITCH_ITEMS.map(([id, key, label, desc]) => (
                  <div
                    key={id}
                    className={cn(
                      "flex items-start justify-between gap-4 rounded-lg border bg-muted/15 p-3.5 transition-opacity",
                      key !== "enabled" && !form.enabled && "opacity-60",
                    )}
                  >
                    <label htmlFor={id} className="flex flex-1 cursor-pointer flex-col gap-0.5">
                      <span className="text-sm leading-snug font-medium">{label}</span>
                      <span id={`${id}-desc`} className="text-sm text-muted-foreground">
                        {desc}
                      </span>
                    </label>
                    <Switch
                      id={id}
                      checked={form[key]}
                      onCheckedChange={(v) => setForm((f) => ({ ...f, [key]: v }))}
                      aria-describedby={`${id}-desc`}
                      className="mt-0.5"
                    />
                  </div>
                ))}
              </CardContent>
              <CardFooter className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                <span className="text-xs text-muted-foreground">
                  {dirty
                    ? "Có thay đổi chưa lưu"
                    : saved?.updatedAt
                      ? `Cập nhật lần cuối: ${new Date(saved.updatedAt).toLocaleString("vi-VN")}`
                      : ""}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void sendTest()}
                    disabled={!hasToken || busy !== "" || dirty || !saved?.hasBotToken}
                  >
                    {busy === "test" ? "Đang gửi…" : "Gửi tin nhắn thử"}
                  </Button>
                  <Button type="submit" disabled={!hasToken || busy !== "" || !dirty}>
                    {busy === "save" ? "Đang lưu…" : "Lưu cấu hình"}
                  </Button>
                </div>
              </CardFooter>
            </Card>
          </form>
        </div>
      )}
    </ModulePage>
  );
}
