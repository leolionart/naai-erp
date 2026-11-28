import { Inject, Injectable } from "@nestjs/common";
import { API_VERSION } from "@naai-erp/contracts";
import { MasterDataService } from "../master-data/master-data.service.js";
import { openSecret, sealSecret } from "./secret-box.js";
import {
  TELEGRAM_FETCH,
  TELEGRAM_SETTINGS_STORE,
  type TelegramFetch,
  type TelegramSettingsContext,
  type TelegramSettingsStore,
  type TelegramSettingsView,
  type UpdateTelegramSettingsInput,
} from "./telegram-settings.types.js";

export const TELEGRAM_SECRET_PURPOSE = "telegram-settings";
const READ_ROLES = new Set(["owner", "finance_admin", "accountant", "approver", "viewer"]);
const CONFIGURE_ROLES = new Set(["owner", "finance_admin"]);
const TOKEN_PATTERN = /^\d{5,}:[A-Za-z0-9_-]{20,}$/;
const CHAT_PATTERN = /^(-?\d{1,20}|@[A-Za-z0-9_]{5,64})$/;

export function redactToken(message: string, token: string) {
  return message
    .split(token)
    .join("[REDACTED]")
    .replace(/bot\d+:[A-Za-z0-9_-]+/g, "bot[REDACTED]");
}

@Injectable()
export class TelegramSettingsService {
  constructor(
    @Inject(TELEGRAM_SETTINGS_STORE) private readonly store: TelegramSettingsStore,
    @Inject(MasterDataService) private readonly masterData: MasterDataService,
    @Inject(TELEGRAM_FETCH) private readonly fetcher: TelegramFetch,
  ) {}

  authenticate(authorization: string | undefined, organizationId: string, correlationId: string) {
    return this.masterData.authenticate(authorization, organizationId, correlationId);
  }

  private envelope(context: TelegramSettingsContext, data: unknown) {
    return {
      apiVersion: API_VERSION,
      requestId: context.correlationId,
      organizationId: context.organizationId,
      data,
    };
  }

  private secret() {
    const secret = process.env.SESSION_SECRET?.trim();
    if (!secret || secret.length < 32) throw new Error("TELEGRAM_SECRET_KEY_UNAVAILABLE");
    return secret;
  }

  private assertConfigure(context: TelegramSettingsContext) {
    if (!context.roles.some((role) => CONFIGURE_ROLES.has(role))) throw new Error("FORBIDDEN");
  }

  private empty(): TelegramSettingsView {
    return {
      enabled: false,
      chatId: null,
      threadId: null,
      notifyRevenue: true,
      notifyExpense: true,
      notifyDrafts: true,
      hasBotToken: false,
      botTokenHint: null,
      version: "0",
      updatedAt: null,
    };
  }

  async get(context: TelegramSettingsContext) {
    if (!context.roles.some((role) => READ_ROLES.has(role))) throw new Error("FORBIDDEN");
    const stored = await this.store.get(context.organizationId);
    if (!stored) return this.envelope(context, this.empty());
    const view: Record<string, unknown> = { ...stored };
    delete view.raw;
    return this.envelope(context, view);
  }

  async update(context: TelegramSettingsContext, input: UpdateTelegramSettingsInput) {
    this.assertConfigure(context);
    const current = (await this.store.get(context.organizationId))?.raw;
    const botToken = input.botToken?.trim();
    if (botToken !== undefined && !TOKEN_PATTERN.test(botToken))
      throw new Error("VALIDATION_FAILED");
    const chatId = input.chatId === undefined ? (current?.chatId ?? null) : input.chatId.trim();
    if (chatId !== null && !CHAT_PATTERN.test(chatId)) throw new Error("VALIDATION_FAILED");
    const threadId = input.threadId === undefined ? (current?.threadId ?? null) : input.threadId;
    if (threadId !== null && (!Number.isSafeInteger(threadId) || threadId < 1))
      throw new Error("VALIDATION_FAILED");
    for (const flag of [
      input.enabled,
      input.notifyRevenue,
      input.notifyExpense,
      input.notifyDrafts,
    ])
      if (flag !== undefined && typeof flag !== "boolean") throw new Error("VALIDATION_FAILED");
    const botTokenEncrypted = botToken
      ? sealSecret(botToken, this.secret(), TELEGRAM_SECRET_PURPOSE)
      : (current?.botTokenEncrypted ?? null);
    const enabled = input.enabled ?? current?.enabled ?? false;
    if (enabled && (!chatId || !botTokenEncrypted)) throw new Error("TELEGRAM_SETTINGS_INCOMPLETE");
    const view = await this.store.upsert(context, {
      enabled,
      chatId,
      threadId,
      botTokenEncrypted,
      botTokenHint: botToken ? botToken.slice(-4) : null,
      notifyRevenue: input.notifyRevenue ?? current?.notifyRevenue ?? true,
      notifyExpense: input.notifyExpense ?? current?.notifyExpense ?? true,
      notifyDrafts: input.notifyDrafts ?? current?.notifyDrafts ?? true,
    });
    return this.envelope(context, view);
  }

  /** Sends a test message with the saved settings so the user can verify the bot and chat. */
  async sendTest(context: TelegramSettingsContext) {
    this.assertConfigure(context);
    const raw = (await this.store.get(context.organizationId))?.raw;
    if (!raw?.botTokenEncrypted || !raw.chatId) throw new Error("TELEGRAM_SETTINGS_INCOMPLETE");
    let token: string;
    try {
      token = openSecret(raw.botTokenEncrypted, this.secret(), TELEGRAM_SECRET_PURPOSE);
    } catch {
      throw new Error("TELEGRAM_SECRET_KEY_UNAVAILABLE");
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await this.fetcher(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: raw.chatId,
          ...(raw.threadId ? { message_thread_id: raw.threadId } : {}),
          text: "✅ NAAI ERP: kết nối thông báo Telegram hoạt động.",
        }),
        signal: controller.signal,
      });
      const body = await response.text();
      const ok = response.status >= 200 && response.status < 300;
      if (ok) await this.store.acknowledgeTestSuccess?.(context.organizationId);
      return this.envelope(context, {
        ok,
        status: response.status,
        ...(ok ? {} : { error: redactToken(body, token).slice(0, 300) }),
      });
    } catch (error) {
      return this.envelope(context, {
        ok: false,
        status: 0,
        error: redactToken(
          error instanceof Error ? error.message : "Telegram request failed",
          token,
        ),
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}
