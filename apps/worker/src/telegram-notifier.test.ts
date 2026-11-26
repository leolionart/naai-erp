import { describe, expect, it } from "vitest";
import {
  formatTelegramMessage,
  redactTelegramError,
  TelegramNotifier,
  type JournalNotification,
  type TelegramNotificationStore,
} from "./telegram-notifier.js";

const token = "123456789:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const base: JournalNotification = {
  organizationId: "org-1",
  eventId: "evt-1",
  attempt: 1,
  target: { botToken: token, chatId: "-100123" },
  journalId: "jr-1",
  journalDate: "2026-11-26",
  description: "Hóa đơn <b>bán hàng</b> & dịch vụ",
  currency: "VND",
  revenueMinor: 12_500_000n,
  expenseMinor: 0n,
};

function store(items: JournalNotification[]) {
  const calls: string[] = [];
  const impl: TelegramNotificationStore = {
    enqueueRecent: async () => items.length,
    lease: async () => items,
    markSent: async (n) => void calls.push(`sent:${n.eventId}`),
    markSkipped: async (n) => void calls.push(`skipped:${n.eventId}`),
    markFailed: async (n, _e, retryAt) =>
      void calls.push(`${retryAt ? "retry" : "failed"}:${n.eventId}`),
  };
  return { impl, calls };
}

describe("telegram message", () => {
  it("labels API-created drafts and shows reference and party", () => {
    const text = formatTelegramMessage({
      ...base,
      draft: true,
      reference: "INV-001",
      party: "Công ty A & B",
      description: "",
    });
    expect(text).toContain("Đã thêm doanh thu (bản nháp, chưa ghi sổ)");
    expect(text).toContain("🧾 INV-001");
    expect(text).toContain("👤 Công ty A &amp; B");
  });

  it("escapes HTML and formats VND amounts", () => {
    const text = formatTelegramMessage(base);
    expect(text).toContain("12.500.000 VND");
    expect(text).toContain("&lt;b&gt;bán hàng&lt;/b&gt; &amp; dịch vụ");
    expect(text).not.toContain("Chi phí");
  });
  it("shows expenses", () => {
    expect(
      formatTelegramMessage({ ...base, revenueMinor: 0n, expenseMinor: 500n, currency: "USD" }),
    ).toContain("Chi phí ghi nhận:</b> 5,00 USD");
  });
  it("redacts the bot token", () => {
    expect(redactTelegramError(`fail https://x/bot${token}/sendMessage`, token)).not.toContain(
      token,
    );
  });
});

describe("TelegramNotifier", () => {
  it("sends revenue notifications and skips zero-effect journals", async () => {
    const { impl, calls } = store([base, { ...base, eventId: "evt-2", revenueMinor: 0n }]);
    const requests: { url: string; body: Record<string, unknown> }[] = [];
    const notifier = new TelegramNotifier(
      impl,
      async (url, init) => {
        requests.push({ url, body: JSON.parse(String(init.body)) });
        return { status: 200, text: async () => "{}" };
      },
      3,
    );
    expect(await notifier.runBatch()).toMatchObject({ sent: 1, skipped: 1, failed: 0 });
    expect(calls).toEqual(["sent:evt-1", "skipped:evt-2"]);
    expect(requests[0]!.url).toBe(`https://api.telegram.org/bot${token}/sendMessage`);
    expect(requests[0]!.body).toMatchObject({ chat_id: "-100123", parse_mode: "HTML" });
  });

  it("retries transient failures and stops on permanent or exhausted ones", async () => {
    const { impl, calls } = store([
      base,
      { ...base, eventId: "evt-3", attempt: 3 },
      { ...base, eventId: "evt-4" },
    ]);
    let n = 0;
    const notifier = new TelegramNotifier(
      impl,
      async () => {
        n += 1;
        return n === 3
          ? { status: 400, text: async () => `bad ${token}` }
          : { status: 500, text: async () => "boom" };
      },
      3,
    );
    expect(await notifier.runBatch()).toMatchObject({ failed: 3 });
    expect(calls).toEqual(["retry:evt-1", "failed:evt-3", "failed:evt-4"]);
  });

  it("treats network errors as retryable", async () => {
    const { impl, calls } = store([base]);
    const notifier = new TelegramNotifier(
      impl,
      async () => {
        throw new Error(`connect failed ${token}`);
      },
      3,
    );
    await notifier.runBatch();
    expect(calls).toEqual(["retry:evt-1"]);
  });

  it("fails permanently without retry when the token cannot be resolved", async () => {
    const { impl, calls } = store([{ ...base, target: undefined }]);
    const notifier = new TelegramNotifier(impl, async () => {
      throw new Error("must not be called");
    });
    expect(await notifier.runBatch()).toMatchObject({ sent: 0, failed: 1 });
    expect(calls).toEqual(["failed:evt-1"]);
  });
});
