import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import pg from "pg";
import type {
  StoredTelegramSettings,
  TelegramSettingsContext,
  TelegramSettingsStore,
  TelegramSettingsView,
} from "./telegram-settings.types.js";

type Row = {
  enabled: boolean;
  chat_id: string | null;
  thread_id: string | null;
  bot_token_encrypted: string | null;
  bot_token_hint: string | null;
  notify_revenue: boolean;
  notify_expense: boolean;
  version: string;
  updated_at: Date;
};

function view(row: Row): TelegramSettingsView {
  return {
    enabled: row.enabled,
    chatId: row.chat_id,
    threadId: row.thread_id === null ? null : Number(row.thread_id),
    notifyRevenue: row.notify_revenue,
    notifyExpense: row.notify_expense,
    hasBotToken: row.bot_token_encrypted !== null,
    botTokenHint: row.bot_token_hint,
    version: row.version,
    updatedAt: row.updated_at.toISOString(),
  };
}

@Injectable()
export class PgTelegramSettingsStore implements TelegramSettingsStore {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  async get(organizationId: string) {
    const result = await this.pool.query<Row>(
      `select enabled,chat_id,thread_id::text,bot_token_encrypted,bot_token_hint,notify_revenue,
              notify_expense,version::text,updated_at
       from telegram_settings where organization_id=$1`,
      [organizationId],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    const raw: StoredTelegramSettings = {
      enabled: row.enabled,
      chatId: row.chat_id,
      threadId: row.thread_id === null ? null : Number(row.thread_id),
      botTokenEncrypted: row.bot_token_encrypted,
      notifyRevenue: row.notify_revenue,
      notifyExpense: row.notify_expense,
    };
    return { ...view(row), raw };
  }

  async upsert(
    context: TelegramSettingsContext,
    patch: Parameters<TelegramSettingsStore["upsert"]>[1],
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await client.query<Row>(
        `insert into telegram_settings
           (organization_id,enabled,enabled_at,chat_id,thread_id,bot_token_encrypted,bot_token_hint,
            notify_revenue,notify_expense,updated_by)
         values($1,$2,case when $2 then now() end,$3,$4,$5,$6,$7,$8,$9)
         on conflict (organization_id) do update set
           enabled_at=case when excluded.enabled and not telegram_settings.enabled then now()
                           when not excluded.enabled then null else telegram_settings.enabled_at end,
           enabled=excluded.enabled,chat_id=excluded.chat_id,thread_id=excluded.thread_id,
           bot_token_encrypted=excluded.bot_token_encrypted,
           bot_token_hint=coalesce(excluded.bot_token_hint,telegram_settings.bot_token_hint),
           notify_revenue=excluded.notify_revenue,notify_expense=excluded.notify_expense,
           version=telegram_settings.version+1,updated_by=excluded.updated_by,updated_at=now()
         returning enabled,chat_id,thread_id::text,bot_token_encrypted,bot_token_hint,notify_revenue,
                   notify_expense,version::text,updated_at`,
        [
          context.organizationId,
          patch.enabled,
          patch.chatId,
          patch.threadId,
          patch.botTokenEncrypted,
          patch.botTokenHint,
          patch.notifyRevenue,
          patch.notifyExpense,
          context.actorId,
        ],
      );
      const row = result.rows[0]!;
      await client.query(
        `insert into resource_audit_events
         (organization_id,id,resource_type,resource_key,resource_version,action,actor_id,
          correlation_id,after_state) values($1,$2,'telegram_settings',$1,$3,'updated',$4,$5,$6)`,
        [
          context.organizationId,
          randomUUID(),
          Number(row.version),
          context.actorId,
          context.correlationId,
          view(row),
        ],
      );
      await client.query("commit");
      return view(row);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}
