import type { JournalActorContext } from "../journals/journal.types.js";

export type TelegramSettingsContext = JournalActorContext;

/** Public view: the bot token is never returned, only whether it exists and its last characters. */
export type TelegramSettingsView = Readonly<{
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
  /** Delivery health of the last 7 days, so a silent failure (e.g. worker without SESSION_SECRET) is visible. */
  delivery?: TelegramDeliveryStats;
}>;

export type TelegramDeliveryStats = Readonly<{
  sentLast7Days: number;
  pending: number;
  failed: number;
  lastSentAt: string | null;
  lastError: string | null;
}>;

export type UpdateTelegramSettingsInput = Readonly<{
  enabled?: boolean;
  botToken?: string;
  chatId?: string;
  threadId?: number | null;
  notifyRevenue?: boolean;
  notifyExpense?: boolean;
  notifyDrafts?: boolean;
}>;

export type StoredTelegramSettings = Readonly<{
  enabled: boolean;
  chatId: string | null;
  threadId: number | null;
  botTokenEncrypted: string | null;
  notifyRevenue: boolean;
  notifyExpense: boolean;
  notifyDrafts: boolean;
}>;

export type TelegramSettingsStore = Readonly<{
  get(
    organizationId: string,
  ): Promise<(TelegramSettingsView & { raw: StoredTelegramSettings }) | undefined>;
  upsert(
    context: TelegramSettingsContext,
    patch: {
      enabled: boolean;
      chatId: string | null;
      threadId: number | null;
      botTokenEncrypted: string | null;
      botTokenHint: string | null;
      notifyRevenue: boolean;
      notifyExpense: boolean;
      notifyDrafts: boolean;
    },
  ): Promise<TelegramSettingsView>;
}>;

export const TELEGRAM_SETTINGS_STORE = Symbol("TELEGRAM_SETTINGS_STORE");
export const TELEGRAM_FETCH = Symbol("TELEGRAM_FETCH");
export type TelegramFetch = (
  input: string,
  init: RequestInit,
) => Promise<Pick<Response, "status" | "text">>;
