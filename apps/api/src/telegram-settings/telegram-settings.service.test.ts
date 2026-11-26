import { beforeEach, describe, expect, it, vi } from "vitest";
import { openSecret } from "./secret-box.js";
import { TELEGRAM_SECRET_PURPOSE, TelegramSettingsService } from "./telegram-settings.service.js";
import type { TelegramSettingsStore } from "./telegram-settings.types.js";

const secret = "test-session-secret-at-least-32-characters";
const token = "123456789:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const owner = { organizationId: "org", actorId: "u", roles: ["owner"], correlationId: "c" };
const viewer = { ...owner, roles: ["viewer"] };

function setup(fetcher = vi.fn()) {
  let saved: Awaited<ReturnType<TelegramSettingsStore["get"]>>;
  const store: TelegramSettingsStore = {
    get: async () => saved,
    upsert: vi.fn(async (_c, patch) => {
      const view = {
        enabled: patch.enabled,
        chatId: patch.chatId,
        threadId: patch.threadId,
        notifyRevenue: patch.notifyRevenue,
        notifyExpense: patch.notifyExpense,
        hasBotToken: patch.botTokenEncrypted !== null,
        botTokenHint: patch.botTokenHint,
        version: "1",
        updatedAt: "2026-01-01T00:00:00.000Z",
      };
      saved = { ...view, raw: { ...patch } };
      return view;
    }),
  };
  const service = new TelegramSettingsService(store, {} as never, fetcher);
  return { service, store, fetcher };
}

describe("TelegramSettingsService", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = secret;
  });

  it("stores the token encrypted and never returns it", async () => {
    const { service, store } = setup();
    const result = await service.update(owner, {
      botToken: token,
      chatId: "-100123",
      enabled: true,
    });
    const patch = vi.mocked(store.upsert).mock.calls[0]![1];
    expect(patch.botTokenEncrypted).not.toContain(token);
    expect(openSecret(patch.botTokenEncrypted!, secret, TELEGRAM_SECRET_PURPOSE)).toBe(token);
    expect(JSON.stringify(result)).not.toContain(token);
    expect(result.data).toMatchObject({
      enabled: true,
      hasBotToken: true,
      botTokenHint: token.slice(-4),
    });
    expect(JSON.stringify(await service.get(owner))).not.toContain("botTokenEncrypted");
  });

  it("keeps the saved token when only other fields change", async () => {
    const { service, store } = setup();
    await service.update(owner, { botToken: token, chatId: "-100123", enabled: true });
    await service.update(owner, { notifyExpense: false });
    const patch = vi.mocked(store.upsert).mock.calls[1]![1];
    expect(openSecret(patch.botTokenEncrypted!, secret, TELEGRAM_SECRET_PURPOSE)).toBe(token);
    expect(patch).toMatchObject({ enabled: true, notifyExpense: false, notifyRevenue: true });
  });

  it("validates input and requires a complete configuration to enable", async () => {
    const { service } = setup();
    await expect(service.update(owner, { botToken: "bad" })).rejects.toThrow("VALIDATION_FAILED");
    await expect(service.update(owner, { chatId: "not a chat" })).rejects.toThrow(
      "VALIDATION_FAILED",
    );
    await expect(service.update(owner, { threadId: 0 })).rejects.toThrow("VALIDATION_FAILED");
    await expect(service.update(owner, { enabled: true })).rejects.toThrow(
      "TELEGRAM_SETTINGS_INCOMPLETE",
    );
  });

  it("restricts writes to owner/finance_admin and reads to organization roles", async () => {
    const { service } = setup();
    await expect(service.update(viewer, { enabled: false })).rejects.toThrow("FORBIDDEN");
    await expect(service.sendTest(viewer)).rejects.toThrow("FORBIDDEN");
    await expect(service.get(viewer)).resolves.toBeDefined();
    await expect(service.get({ ...owner, roles: ["integration"] })).rejects.toThrow("FORBIDDEN");
  });

  it("sends a test message and redacts the token from failures", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ status: 200, text: async () => "{}" })
      .mockResolvedValueOnce({ status: 401, text: async () => `Unauthorized ${token}` });
    const { service } = setup(fetcher);
    await service.update(owner, { botToken: token, chatId: "-100123", threadId: 5 });
    expect((await service.sendTest(owner)).data).toEqual({ ok: true, status: 200 });
    expect(fetcher.mock.calls[0]![0]).toBe(`https://api.telegram.org/bot${token}/sendMessage`);
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toMatchObject({
      chat_id: "-100123",
      message_thread_id: 5,
    });
    const failed = await service.sendTest(owner);
    expect(failed.data).toMatchObject({ ok: false, status: 401 });
    expect(JSON.stringify(failed)).not.toContain(token);
  });

  it("requires saved settings before testing", async () => {
    await expect(setup().service.sendTest(owner)).rejects.toThrow("TELEGRAM_SETTINGS_INCOMPLETE");
  });
});
