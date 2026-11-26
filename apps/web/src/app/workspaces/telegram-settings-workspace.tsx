"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ModulePage } from "@/components/layout/module-page";
import { useAuthenticatedApiClient } from "@/lib/api";

type TelegramSettings = Readonly<{
  enabled: boolean;
  chatId: string | null;
  threadId: number | null;
  notifyRevenue: boolean;
  notifyExpense: boolean;
  notifyDrafts: boolean;
  hasBotToken: boolean;
  botTokenHint: string | null;
  version: string;
  updatedAt: string | null;
  delivery?: Readonly<{
    sentLast7Days: number;
    pending: number;
    failed: number;
    lastSentAt: string | null;
    lastError: string | null;
  }>;
}>;

type TestResult = Readonly<{ ok: boolean; status: number; error?: string }>;

const PATH = "telegram-settings";

function Toggle({
  id,
  label,
  description,
  checked,
  onChange,
}: Readonly<{
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}>) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3">
      <input
        id={id}
        type="checkbox"
        className="mt-1 size-4 accent-current"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-muted-foreground text-sm">{description}</span>
      </span>
    </label>
  );
}

export function TelegramSettingsWorkspace() {
  const { client, hasToken, hydrated } = useAuthenticatedApiClient();
  const [saved, setSaved] = useState<TelegramSettings>();
  const [enabled, setEnabled] = useState(false);
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [threadId, setThreadId] = useState("");
  const [notifyRevenue, setNotifyRevenue] = useState(true);
  const [notifyExpense, setNotifyExpense] = useState(true);
  const [notifyDrafts, setNotifyDrafts] = useState(true);
  const [busy, setBusy] = useState<"" | "save" | "test">("");
  const [error, setError] = useState("");
  const [testResult, setTestResult] = useState<TestResult>();

  const apply = useCallback((settings: TelegramSettings) => {
    setSaved(settings);
    setEnabled(settings.enabled);
    setChatId(settings.chatId ?? "");
    setThreadId(settings.threadId === null ? "" : String(settings.threadId));
    setNotifyRevenue(settings.notifyRevenue);
    setNotifyExpense(settings.notifyExpense);
    setNotifyDrafts(settings.notifyDrafts);
    setBotToken("");
  }, []);

  useEffect(() => {
    if (!hydrated || !hasToken) return;
    client
      .data<TelegramSettings>(PATH)
      .then(apply)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, [apply, client, hasToken, hydrated]);

  async function save() {
    setBusy("save");
    setError("");
    setTestResult(undefined);
    try {
      const trimmedThread = threadId.trim();
      const result = await client.data<TelegramSettings>(PATH, {
        method: "PATCH",
        body: {
          enabled,
          chatId: chatId.trim() || undefined,
          threadId: trimmedThread ? Number(trimmedThread) : null,
          notifyRevenue,
          notifyExpense,
          notifyDrafts,
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
      setTestResult(await client.data<TestResult>(`${PATH}/test`, { method: "POST", body: {} }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy("");
    }
  }

  const dirty =
    !saved ||
    enabled !== saved.enabled ||
    chatId.trim() !== (saved.chatId ?? "") ||
    threadId.trim() !== (saved.threadId === null ? "" : String(saved.threadId)) ||
    notifyRevenue !== saved.notifyRevenue ||
    notifyExpense !== saved.notifyExpense ||
    notifyDrafts !== saved.notifyDrafts ||
    botToken.trim() !== "";

  return (
    <ModulePage
      title="Thông báo Telegram"
      description="Nhận tin nhắn Telegram mỗi khi có doanh thu hoặc chi phí được ghi sổ."
      section="Cấu hình & Vận hành"
    >
      <div className="flex max-w-2xl flex-col gap-6">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Không thực hiện được</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Kết nối bot
              <Badge variant={saved?.enabled ? "default" : "secondary"}>
                {saved?.enabled ? "Đang bật" : "Đang tắt"}
              </Badge>
            </CardTitle>
            <CardDescription>
              Tạo bot với @BotFather, thêm bot vào nhóm/kênh nhận tin rồi dán token và Chat ID bên
              dưới. Token được mã hóa và không bao giờ hiển thị lại.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="telegram-bot-token">Bot token</FieldLabel>
                <Input
                  id="telegram-bot-token"
                  type="password"
                  autoComplete="off"
                  placeholder={
                    saved?.hasBotToken
                      ? `Đã lưu (…${saved.botTokenHint ?? "****"}) — để trống để giữ nguyên`
                      : "123456789:AA…"
                  }
                  value={botToken}
                  onChange={(event) => setBotToken(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="telegram-chat-id">Chat ID</FieldLabel>
                <Input
                  id="telegram-chat-id"
                  placeholder="-1001234567890 hoặc @tenkenh"
                  value={chatId}
                  onChange={(event) => setChatId(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="telegram-thread-id">Topic ID (tùy chọn)</FieldLabel>
                <Input
                  id="telegram-thread-id"
                  inputMode="numeric"
                  placeholder="Chỉ cần với nhóm có bật Topics"
                  value={threadId}
                  onChange={(event) => setThreadId(event.target.value.replace(/\D/g, ""))}
                />
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Loại thông báo</CardTitle>
            <CardDescription>
              Chỉ các bút toán ghi sổ sau thời điểm bật mới được gửi; dữ liệu cũ không bị gửi lại.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Toggle
              id="telegram-enabled"
              label="Bật thông báo Telegram"
              description="Cần có bot token và Chat ID."
              checked={enabled}
              onChange={setEnabled}
            />
            <Toggle
              id="telegram-revenue"
              label="Doanh thu"
              description="Khi hóa đơn bán hàng hoặc bút toán doanh thu được ghi sổ."
              checked={notifyRevenue}
              onChange={setNotifyRevenue}
            />
            <Toggle
              id="telegram-drafts"
              label="Cả bản nháp"
              description="Thông báo ngay khi hóa đơn/chi phí được thêm dưới dạng bản nháp (ví dụ qua API hoặc n8n), chưa cần ghi sổ."
              checked={notifyDrafts}
              onChange={setNotifyDrafts}
            />
            <Toggle
              id="telegram-expense"
              label="Chi phí"
              description="Khi chi phí hoặc hóa đơn mua vào được ghi sổ."
              checked={notifyExpense}
              onChange={setNotifyExpense}
            />
          </CardContent>
        </Card>
        {saved?.delivery ? (
          <Alert variant={saved.delivery.failed > 0 ? "destructive" : "default"}>
            <AlertTitle>Tình trạng gửi (7 ngày qua)</AlertTitle>
            <AlertDescription>
              Đã gửi {saved.delivery.sentLast7Days} · đang chờ {saved.delivery.pending} · lỗi{" "}
              {saved.delivery.failed}
              {saved.delivery.lastSentAt
                ? ` · lần gửi gần nhất ${new Date(saved.delivery.lastSentAt).toLocaleString("vi-VN")}`
                : ""}
              {saved.delivery.lastError ? ` · lỗi gần nhất: ${saved.delivery.lastError}` : ""}
              {saved.enabled && saved.delivery.sentLast7Days === 0 && saved.delivery.failed === 0
                ? " · Chưa có thông báo nào được gửi: hãy thử gửi tin nhắn thử và kiểm tra worker đang chạy với SESSION_SECRET."
                : ""}
            </AlertDescription>
          </Alert>
        ) : null}
        {testResult ? (
          <Alert variant={testResult.ok ? "default" : "destructive"}>
            <AlertTitle>{testResult.ok ? "Gửi thử thành công" : "Gửi thử thất bại"}</AlertTitle>
            <AlertDescription>
              {testResult.ok
                ? "Kiểm tra Telegram để thấy tin nhắn thử."
                : `${testResult.error ?? "Không rõ lỗi"} (HTTP ${testResult.status})`}
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="flex gap-3">
          <Button onClick={save} disabled={!hasToken || busy !== "" || !dirty}>
            {busy === "save" ? "Đang lưu…" : "Lưu cấu hình"}
          </Button>
          <Button
            variant="outline"
            onClick={sendTest}
            disabled={!hasToken || busy !== "" || dirty || !saved?.hasBotToken}
          >
            {busy === "test" ? "Đang gửi…" : "Gửi tin nhắn thử"}
          </Button>
        </div>
      </div>
    </ModulePage>
  );
}
