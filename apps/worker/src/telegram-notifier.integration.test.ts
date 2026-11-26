import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sealSecret } from "./secret-box.js";
import {
  PgTelegramNotificationStore,
  TELEGRAM_SECRET_PURPOSE,
  TelegramNotifier,
} from "./telegram-notifier.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
const describeIntegration = enabled ? describe.sequential : describe.skip;
const secret = "integration-session-secret-at-least-32-chars";
const token = "123456789:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

describeIntegration("PostgreSQL Telegram notifications", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const org = `org-tg-${Date.now()}`;

  async function journal(id: string, lines: [string, "debit" | "credit", number][]) {
    await pool.query(
      `insert into journal_entries(organization_id,id,journal_date,description,currency)
       values($1,$2,'2026-11-26',$3,'VND')`,
      [org, id, `Journal ${id}`],
    );
    let n = 0;
    for (const [account, side, amount] of lines)
      await pool.query(
        `insert into journal_lines(organization_id,journal_id,line_number,account_code,debit_minor,credit_minor)
         values($1,$2,$3,$4,$5,$6)`,
        [
          org,
          id,
          ++n,
          account,
          side === "debit" ? amount : null,
          side === "credit" ? amount : null,
        ],
      );
    await pool.query(
      `update journal_entries set state='posted',approved_at=now(),approved_by='admin',
         approval_reason='test',posted_at=now(),posted_by='admin' where organization_id=$1 and id=$2`,
      [org, id],
    );
    await pool.query(
      `insert into outbox_events(organization_id,id,aggregate_type,aggregate_id,event_type,payload,correlation_id)
       values($1,$2,'journal',$3,'journal.posted','{}','corr')`,
      [org, `evt-${id}`, id],
    );
  }

  beforeAll(async () => {
    await pool.query(
      "insert into organizations(id,legal_name,base_currency,timezone) values($1,'TG Org','VND','Asia/Ho_Chi_Minh')",
      [org],
    );
    await pool.query(
      `insert into accounts(organization_id,code,name,root_type) values
         ($1,'111','Cash','asset'),($1,'131','Receivable','asset'),
         ($1,'511','Revenue','revenue'),($1,'642','Opex','expense')`,
      [org],
    );
    await pool.query(
      `insert into telegram_settings(organization_id,enabled,enabled_at,chat_id,bot_token_encrypted,notify_expense)
       values($1,true,now()-interval '1 minute','-100123',$2,false)`,
      [org, sealSecret(token, secret, TELEGRAM_SECRET_PURPOSE)],
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  it("notifies revenue, skips disabled expense toggle and never duplicates", async () => {
    await journal("jr-rev", [
      ["131", "debit", 1_000_000],
      ["511", "credit", 1_000_000],
    ]);
    await journal("jr-exp", [
      ["642", "debit", 200_000],
      ["111", "credit", 200_000],
    ]);
    const sent: { url: string; text: string }[] = [];
    const store = new PgTelegramNotificationStore(pool, secret);
    const notifier = new TelegramNotifier(store, async (url, init) => {
      sent.push({ url, text: JSON.parse(String(init.body)).text });
      return { status: 200, text: async () => "{}" };
    });
    await notifier.runBatch(100);
    await notifier.runBatch(100);
    const mine = sent.filter((m) => m.text.includes("Journal jr-"));
    expect(mine).toHaveLength(1);
    expect(mine[0]!.text).toContain("Doanh thu ghi nhận");
    expect(mine[0]!.url).toContain(`bot${token}/sendMessage`);
    const states = await pool.query(
      "select outbox_event_id,state from telegram_notifications where organization_id=$1 order by 1",
      [org],
    );
    expect(states.rows).toEqual([
      { outbox_event_id: "evt-jr-exp", state: "skipped" },
      { outbox_event_id: "evt-jr-rev", state: "sent" },
    ]);
  });

  it("ignores organizations that have not enabled Telegram", async () => {
    await pool.query(
      "update telegram_settings set enabled=false,enabled_at=null where organization_id=$1",
      [org],
    );
    await journal("jr-off", [
      ["131", "debit", 5],
      ["511", "credit", 5],
    ]);
    const store = new PgTelegramNotificationStore(pool, secret);
    await new TelegramNotifier(store, async () => {
      throw new Error("must not send");
    }).runBatch(100);
    const rows = await pool.query(
      "select 1 from telegram_notifications where organization_id=$1 and outbox_event_id='evt-jr-off'",
      [org],
    );
    expect(rows.rowCount).toBe(0);
  });
});
