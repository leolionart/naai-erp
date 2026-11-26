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
  /** True for a record created as a draft (not yet in the ledger); `journalId` is then its id. */
  draft?: boolean;
  action?: "created" | "updated" | "deleted" | "reversed" | "cancelled";
  reason?: string;
  reference?: string;
  party?: string;
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

function actionLabel(kind: "revenue" | "expense", notification: JournalNotification): string {
  const action = notification.action ?? "created";
  const draft = notification.draft === true;
  if (action === "deleted") {
    return kind === "revenue" ? "Đã xóa bản nháp doanh thu" : "Đã xóa bản nháp chi phí";
  }
  if (action === "reversed" || action === "cancelled") {
    return kind === "revenue" ? "Đã hủy / đảo sổ doanh thu" : "Đã hủy / đảo sổ chi phí";
  }
  if (action === "updated") {
    return kind === "revenue"
      ? draft
        ? "Đã sửa doanh thu (bản nháp)"
        : "Đã sửa doanh thu"
      : draft
        ? "Đã sửa chi phí (bản nháp)"
        : "Đã sửa chi phí";
  }
  return kind === "revenue"
    ? draft
      ? "Đã thêm doanh thu (bản nháp, chưa ghi sổ)"
      : "Doanh thu ghi nhận"
    : draft
      ? "Đã thêm chi phí (bản nháp, chưa ghi sổ)"
      : "Chi phí ghi nhận";
}

export function formatTelegramMessage(notification: JournalNotification): string {
  const lines: string[] = [];
  if (notification.revenueMinor !== 0n)
    lines.push(
      `💰 <b>${actionLabel("revenue", notification)}:</b> ${escapeHtml(formatMinor(notification.revenueMinor, notification.currency))}`,
    );
  if (notification.expenseMinor !== 0n)
    lines.push(
      `💸 <b>${actionLabel("expense", notification)}:</b> ${escapeHtml(formatMinor(notification.expenseMinor, notification.currency))}`,
    );
  lines.push(`📅 ${escapeHtml(notification.journalDate)}`);
  if (notification.reference) lines.push(`🧾 ${escapeHtml(notification.reference)}`);
  if (notification.party) lines.push(`👤 ${escapeHtml(notification.party)}`);
  if (notification.description)
    lines.push(`📝 ${escapeHtml(notification.description.slice(0, 300))}`);
  if (notification.reason) lines.push(`📌 ${escapeHtml(notification.reason.slice(0, 200))}`);
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

  async runBatch(limit = 20, lookbackMinutes = 1440) {
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
       where e.event_type in (
               'journal.posted','journal.reversed',
               'expense.created','expense.updated','expense.discarded','expense.reversed',
               'sales_invoice.created','sales_invoice.updated','sales_invoice.deleted','sales_invoice.cancelled',
               'purchase_invoice.created','purchase_invoice.updated','purchase_invoice.deleted','purchase_invoice.cancelled',
               'credit_note.created','credit_note.updated','credit_note.deleted','credit_note.cancelled'
             )
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
        const event = await client.query<{
          event_type: string;
          aggregate_id: string;
          payload: Record<string, unknown> | null;
          enabled: boolean | null;
          notify_revenue: boolean | null;
          notify_expense: boolean | null;
          notify_drafts: boolean | null;
          bot_token_encrypted: string | null;
          chat_id: string | null;
          thread_id: string | null;
        }>(
          `select e.event_type,e.aggregate_id,e.payload,s.enabled,s.notify_revenue,s.notify_expense,s.notify_drafts,
                  s.bot_token_encrypted,s.chat_id,s.thread_id::text
             from outbox_events e
             left join telegram_settings s on s.organization_id=e.organization_id
            where e.organization_id=$1 and e.id=$2`,
          [row.organization_id, row.outbox_event_id],
        );
        const settings = event.rows[0];
        // Disabled since enqueueing, or the kind of entry is switched off: treat as zero effect.
        const active = settings?.enabled === true;
        const base = {
          organizationId: row.organization_id,
          eventId: row.outbox_event_id,
          attempt: leased.rows[0]?.attempts ?? 1,
          target: settings ? this.target(settings) : undefined,
        };
        const none = {
          ...base,
          journalId: "",
          journalDate: "",
          description: "",
          currency: "VND",
          revenueMinor: 0n,
          expenseMinor: 0n,
        };
        if (!settings) {
          notifications.push(none);
          continue;
        }
        const eventType = settings.event_type;
        const isJournal = eventType === "journal.posted" || eventType === "journal.reversed";
        const isVoidOrReverse =
          eventType === "journal.reversed" ||
          eventType.endsWith(".reversed") ||
          eventType.endsWith(".cancelled");
        const isDeleted = eventType === "expense.discarded" || eventType.endsWith(".deleted");
        const action: JournalNotification["action"] = eventType.endsWith(".updated")
          ? "updated"
          : isDeleted
            ? "deleted"
            : eventType.endsWith(".reversed")
              ? "reversed"
              : eventType.endsWith(".cancelled")
                ? "cancelled"
                : "created";
        if (!isJournal && !isVoidOrReverse && settings.notify_drafts !== true) {
          notifications.push(none);
          continue;
        }
        const loaded = isJournal
          ? await this.loadJournal(client, row.organization_id, settings.aggregate_id)
          : isDeleted
            ? this.loadDeleted(eventType, settings.aggregate_id, settings.payload)
            : await this.loadDraft(client, row.organization_id, eventType, settings.aggregate_id);
        notifications.push({
          ...base,
          ...(loaded ?? none),
          action,
          ...(typeof settings.payload?.reason === "string" && settings.payload.reason
            ? { reason: settings.payload.reason }
            : {}),
          revenueMinor: active && settings.notify_revenue ? (loaded?.revenueMinor ?? 0n) : 0n,
          expenseMinor: active && settings.notify_expense ? (loaded?.expenseMinor ?? 0n) : 0n,
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

  private async loadJournal(client: pg.PoolClient, organizationId: string, journalId: string) {
    const journal = await client.query<{
      journal_id: string;
      journal_date: string;
      description: string;
      currency: string;
      revenue_minor: string;
      expense_minor: string;
    }>(
      `select j.id journal_id,j.journal_date::text journal_date,j.description,j.currency,
         coalesce(sum(coalesce(l.credit_minor,0)-coalesce(l.debit_minor,0))
           filter (where l.account_code ~ '^[57]'),0)::text revenue_minor,
         coalesce(sum(coalesce(l.debit_minor,0)-coalesce(l.credit_minor,0))
           filter (where l.account_code ~ '^[68]'),0)::text expense_minor
       from journal_entries j
       left join journal_lines l on l.organization_id=j.organization_id and l.journal_id=j.id
       where j.organization_id=$1 and j.id=$2 and j.state in ('posted','reversed')
         and j.reversal_of_id is null
       group by j.id,j.journal_date,j.description,j.currency`,
      [organizationId, journalId],
    );
    const found = journal.rows[0];
    return found
      ? {
          journalId: found.journal_id,
          journalDate: found.journal_date,
          description: found.description,
          currency: found.currency,
          revenueMinor: BigInt(found.revenue_minor),
          expenseMinor: BigInt(found.expense_minor),
        }
      : undefined;
  }

  private loadDeleted(
    eventType: string,
    recordId: string,
    payload: Record<string, unknown> | null,
  ) {
    if (!payload) return undefined;
    const gross = BigInt(String(payload.grossMinor ?? "0"));
    if (gross === 0n) return undefined;
    const isExpense = eventType.startsWith("expense.");
    const docType = String(payload.type ?? eventType.split(".")[0] ?? "");
    return {
      draft: true,
      journalId: recordId,
      journalDate: String(payload.expenseDate ?? payload.documentDate ?? "").slice(0, 10),
      description: String(payload.description ?? ""),
      currency: String(payload.currency ?? "VND"),
      ...(payload.documentNumber ? { reference: String(payload.documentNumber) } : {}),
      revenueMinor:
        !isExpense && docType === "sales_invoice"
          ? gross
          : !isExpense && docType === "credit_note"
            ? -gross
            : 0n,
      expenseMinor: isExpense || docType === "purchase_invoice" ? gross : 0n,
    };
  }

  /** A record created, updated or reversed/cancelled: report its gross amount. */
  private async loadDraft(
    client: pg.PoolClient,
    organizationId: string,
    eventType: string,
    recordId: string,
  ) {
    if (eventType.startsWith("expense.")) {
      const result = await client.query<{
        id: string;
        state: string;
        date: string;
        purpose: string | null;
        currency: string;
        gross: string;
        party: string | null;
      }>(
        `select e.id,e.state::text,e.expense_date::text date,e.business_purpose purpose,e.currency,e.gross_minor::text gross,
                p.display_name party
           from expenses e left join parties p on p.organization_id=e.organization_id and p.id=e.payee_party_id
          where e.organization_id=$1 and e.id=$2`,
        [organizationId, recordId],
      );
      const found = result.rows[0];
      return found
        ? {
            draft: found.state === "draft",
            journalId: found.id,
            journalDate: found.date,
            description: found.purpose ?? "",
            currency: found.currency,
            revenueMinor: 0n,
            expenseMinor: BigInt(found.gross),
            ...(found.party ? { party: found.party } : {}),
          }
        : undefined;
    }
    const result = await client.query<{
      id: string;
      type: string;
      state: string;
      number: string;
      date: string;
      currency: string;
      gross: string;
      party: string | null;
    }>(
      `select d.id,d.type::text,d.state::text,d.document_number number,d.document_date::text date,d.currency,
              d.gross_minor::text gross,p.display_name party
         from commercial_documents d left join parties p on p.organization_id=d.organization_id and p.id=d.party_id
        where d.organization_id=$1 and d.id=$2`,
      [organizationId, recordId],
    );
    const found = result.rows[0];
    if (!found) return undefined;
    const gross = BigInt(found.gross);
    return {
      draft: found.state === "draft",
      journalId: found.id,
      journalDate: found.date,
      description: "",
      currency: found.currency,
      reference: found.number,
      // A credit note reduces revenue; a purchase invoice is a cost.
      revenueMinor:
        found.type === "sales_invoice" ? gross : found.type === "credit_note" ? -gross : 0n,
      expenseMinor: found.type === "purchase_invoice" ? gross : 0n,
      ...(found.party ? { party: found.party } : {}),
    };
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
