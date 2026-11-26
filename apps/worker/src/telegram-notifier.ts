import type pg from "pg";
import { openSecret } from "./secret-box.js";

/** A posted journal reduced to the revenue/expense effect worth notifying about. */
export type JournalNotification = Readonly<{
  organizationId: string;
  eventId: string;
  attempt: number;
  /** Undefined when the stored token cannot be decrypted. */
  target: TelegramTarget | undefined;
  journalId: string;
  journalDate: string;
  description: string;
  currency: string;
  revenueMinor: bigint;
  expenseMinor: bigint;
}>;

/** Per-organization delivery target resolved from the in-app settings (token already decrypted). */
export type TelegramTarget = Readonly<{
  botToken: string;
  chatId: string;
  threadId?: number;
}>;

export interface TelegramNotificationStore {
  enqueueRecent(lookbackMinutes: number): Promise<number>;
  lease(limit: number): Promise<readonly JournalNotification[]>;
  markSent(notification: JournalNotification): Promise<void>;
  markSkipped(notification: JournalNotification): Promise<void>;
  markFailed(
    notification: JournalNotification,
    error: string,
    retryAt: Date | undefined,
  ): Promise<void>;
}

export type TelegramFetch = (
  input: string,
  init: RequestInit,
) => Promise<Pick<Response, "status" | "text">>;

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatMinor(minor: bigint, currency: string) {
  const exponent = currency === "VND" ? 0 : 2;
  const divisor = 10n ** BigInt(exponent);
  const whole = (minor < 0n ? -minor : minor) / divisor;
  const fraction = (minor < 0n ? -minor : minor) % divisor;
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const text = exponent ? `${grouped},${fraction.toString().padStart(exponent, "0")}` : grouped;
  return `${minor < 0n ? "-" : ""}${text} ${currency}`;
}

export function formatTelegramMessage(notification: JournalNotification): string {
  const lines: string[] = [];
  if (notification.revenueMinor !== 0n)
    lines.push(
      `💰 <b>Doanh thu ghi nhận:</b> ${escapeHtml(formatMinor(notification.revenueMinor, notification.currency))}`,
    );
  if (notification.expenseMinor !== 0n)
    lines.push(
      `💸 <b>Chi phí ghi nhận:</b> ${escapeHtml(formatMinor(notification.expenseMinor, notification.currency))}`,
    );
  lines.push(`📅 ${escapeHtml(notification.journalDate)}`);
  lines.push(`📝 ${escapeHtml(notification.description.slice(0, 300))}`);
  lines.push(
    `🏢 ${escapeHtml(notification.organizationId)} · ${escapeHtml(notification.journalId)}`,
  );
  return lines.join("\n");
}

export function telegramRetryDelaySeconds(attempt: number) {
  return Math.min(3600, 30 * 2 ** Math.max(0, attempt - 1));
}

/** Redacts the bot token so it can never leak through logs or the stored last_error. */
export function redactTelegramError(message: string, botToken: string) {
  return message.split(botToken).join("[REDACTED]").slice(0, 500);
}

export class TelegramNotifier {
  constructor(
    private readonly store: TelegramNotificationStore,
    private readonly fetcher: TelegramFetch,
    private readonly maxAttempts = 5,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async runBatch(limit = 20, lookbackMinutes = 60) {
    const enqueued = await this.store.enqueueRecent(lookbackMinutes);
    const leased = await this.store.lease(limit);
    let sent = 0;
    let skipped = 0;
    let failed = 0;
    for (const notification of leased) {
      if (notification.revenueMinor === 0n && notification.expenseMinor === 0n) {
        await this.store.markSkipped(notification);
        skipped += 1;
        continue;
      }
      const error = notification.target
        ? await this.send(notification, notification.target)
        : { message: "Telegram settings or bot token are unavailable", retryAt: undefined };
      if (!error) {
        await this.store.markSent(notification);
        sent += 1;
        continue;
      }
      failed += 1;
      await this.store.markFailed(notification, error.message, error.retryAt);
    }
    return { enqueued, leased: leased.length, sent, skipped, failed };
  }

  private async send(
    notification: JournalNotification,
    target: TelegramTarget,
  ): Promise<{ message: string; retryAt: Date | undefined } | undefined> {
    const attempt = notification.attempt;
    const retryAt =
      attempt < this.maxAttempts
        ? new Date(this.now().getTime() + telegramRetryDelaySeconds(attempt) * 1000)
        : undefined;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await this.fetcher(
        `https://api.telegram.org/bot${target.botToken}/sendMessage`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chat_id: target.chatId,
            ...(target.threadId !== undefined ? { message_thread_id: target.threadId } : {}),
            text: formatTelegramMessage(notification),
            parse_mode: "HTML",
            disable_web_page_preview: true,
          }),
          signal: controller.signal,
        },
      );
      if (response.status >= 200 && response.status < 300) return undefined;
      const body = await response.text();
      const permanent = response.status >= 400 && response.status < 500 && response.status !== 429;
      return {
        message: redactTelegramError(`Telegram HTTP ${response.status}: ${body}`, target.botToken),
        retryAt: permanent ? undefined : retryAt,
      };
    } catch (error) {
      return {
        message: redactTelegramError(
          error instanceof Error ? error.message : "Telegram request failed",
          target.botToken,
        ),
        retryAt,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const TELEGRAM_SECRET_PURPOSE = "telegram-settings";

export class PgTelegramNotificationStore implements TelegramNotificationStore {
  constructor(
    private readonly pool: pg.Pool,
    private readonly sessionSecret: string | undefined,
  ) {}

  /** Only organizations that enabled Telegram, and only events recorded after it was enabled. */
  async enqueueRecent(lookbackMinutes: number) {
    const result = await this.pool.query(
      `insert into telegram_notifications(organization_id,outbox_event_id)
       select e.organization_id,e.id from outbox_events e
       join telegram_settings s on s.organization_id=e.organization_id and s.enabled
       where e.event_type='journal.posted'
         and e.occurred_at > now() - make_interval(mins => $1::int)
         and e.occurred_at >= coalesce(s.enabled_at,'-infinity')
       on conflict do nothing`,
      [lookbackMinutes],
    );
    return result.rowCount ?? 0;
  }

  private target(row: {
    bot_token_encrypted: string | null;
    chat_id: string | null;
    thread_id: string | null;
  }): TelegramTarget | undefined {
    if (!row.bot_token_encrypted || !row.chat_id || !this.sessionSecret) return undefined;
    try {
      return {
        botToken: openSecret(row.bot_token_encrypted, this.sessionSecret, TELEGRAM_SECRET_PURPOSE),
        chatId: row.chat_id,
        ...(row.thread_id ? { threadId: Number(row.thread_id) } : {}),
      };
    } catch {
      return undefined;
    }
  }

  async lease(limit: number): Promise<readonly JournalNotification[]> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const due = await client.query<{ organization_id: string; outbox_event_id: string }>(
        `select organization_id,outbox_event_id from telegram_notifications
         where state='pending' and next_attempt_at<=now()
         order by created_at limit $1 for update skip locked`,
        [Math.max(1, Math.min(limit, 100))],
      );
      const notifications: JournalNotification[] = [];
      for (const row of due.rows) {
        // Attempt is counted at lease time and the retry window pushed out so a crashed worker
        // cannot cause a tight resend loop.
        const leased = await client.query<{ attempts: number }>(
          `update telegram_notifications set attempts=attempts+1,next_attempt_at=now()+interval '5 minutes'
           where organization_id=$1 and outbox_event_id=$2 returning attempts`,
          [row.organization_id, row.outbox_event_id],
        );
        const journal = await client.query<{
          journal_id: string;
          journal_date: string;
          description: string;
          currency: string;
          revenue_minor: string;
          expense_minor: string;
          enabled: boolean | null;
          notify_revenue: boolean | null;
          notify_expense: boolean | null;
          bot_token_encrypted: string | null;
          chat_id: string | null;
          thread_id: string | null;
        }>(
          `select j.id journal_id,j.journal_date::text journal_date,j.description,j.currency,
             coalesce(sum(coalesce(l.credit_minor,0)-coalesce(l.debit_minor,0))
               filter (where l.account_code ~ '^[57]'),0)::text revenue_minor,
             coalesce(sum(coalesce(l.debit_minor,0)-coalesce(l.credit_minor,0))
               filter (where l.account_code ~ '^[68]'),0)::text expense_minor,
             s.enabled,s.notify_revenue,s.notify_expense,s.bot_token_encrypted,s.chat_id,s.thread_id::text
           from outbox_events e
           join journal_entries j on j.organization_id=e.organization_id and j.id=e.aggregate_id
           left join journal_lines l on l.organization_id=j.organization_id and l.journal_id=j.id
           left join telegram_settings s on s.organization_id=e.organization_id
           where e.organization_id=$1 and e.id=$2 and j.state in ('posted','reversed')
             and j.reversal_of_id is null
           group by j.id,j.journal_date,j.description,j.currency,s.enabled,s.notify_revenue,
             s.notify_expense,s.bot_token_encrypted,s.chat_id,s.thread_id`,
          [row.organization_id, row.outbox_event_id],
        );
        const found = journal.rows[0];
        // Disabled since enqueueing, or the kind of entry is switched off: treat as zero effect.
        const active = found?.enabled === true;
        notifications.push({
          organizationId: row.organization_id,
          eventId: row.outbox_event_id,
          attempt: leased.rows[0]?.attempts ?? 1,
          target: found ? this.target(found) : undefined,
          journalId: found?.journal_id ?? "",
          journalDate: found?.journal_date ?? "",
          description: found?.description ?? "",
          currency: found?.currency ?? "VND",
          revenueMinor: active && found.notify_revenue ? BigInt(found.revenue_minor) : 0n,
          expenseMinor: active && found.notify_expense ? BigInt(found.expense_minor) : 0n,
        });
      }
      await client.query("commit");
      return notifications;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async markSent(n: JournalNotification) {
    await this.pool.query(
      `update telegram_notifications set state='sent',sent_at=now(),last_error=null
       where organization_id=$1 and outbox_event_id=$2`,
      [n.organizationId, n.eventId],
    );
  }

  async markSkipped(n: JournalNotification) {
    await this.pool.query(
      `update telegram_notifications set state='skipped' where organization_id=$1 and outbox_event_id=$2`,
      [n.organizationId, n.eventId],
    );
  }

  async markFailed(n: JournalNotification, error: string, retryAt: Date | undefined) {
    await this.pool.query(
      `update telegram_notifications set last_error=$3,
         state=case when $4::timestamptz is null then 'failed' else 'pending' end,
         next_attempt_at=coalesce($4::timestamptz,next_attempt_at)
       where organization_id=$1 and outbox_event_id=$2`,
      [n.organizationId, n.eventId, error, retryAt ?? null],
    );
  }
}
