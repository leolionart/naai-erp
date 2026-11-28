import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PgTelegramSettingsStore } from "./pg-telegram-settings.store.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
const describeIntegration = enabled ? describe.sequential : describe.skip;

describeIntegration("PostgreSQL Telegram settings", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const org = `org-tgs-${Date.now()}`;
  const context = { organizationId: org, actorId: "admin", roles: ["owner"], correlationId: "c" };
  const patch = {
    enabled: true,
    chatId: "-100123",
    threadId: 7,
    botTokenEncrypted: "v1.cipher",
    botTokenHint: "AAAA",
    notifyRevenue: true,
    notifyExpense: false,
    notifyDrafts: true,
  };

  beforeAll(async () => {
    await pool.query(
      "insert into organizations(id,legal_name,base_currency,timezone) values($1,'TGS','VND','Asia/Ho_Chi_Minh')",
      [org],
    );
  });
  afterAll(() => pool.end());

  it("upserts, versions, audits and keeps enabled_at stable until re-enabled", async () => {
    const store = new PgTelegramSettingsStore();
    expect(await store.get(org)).toBeUndefined();
    const first = await store.upsert(context, patch);
    expect(first).toMatchObject({ enabled: true, threadId: 7, hasBotToken: true, version: "1" });
    expect(JSON.stringify(first)).not.toContain("cipher");
    const enabledAt = (
      await pool.query("select enabled_at from telegram_settings where organization_id=$1", [org])
    ).rows[0].enabled_at;
    const second = await store.upsert(context, {
      ...patch,
      notifyRevenue: false,
      botTokenHint: null,
    });
    expect(second).toMatchObject({ version: "2", botTokenHint: "AAAA", notifyRevenue: false });
    expect(
      (await pool.query("select enabled_at from telegram_settings where organization_id=$1", [org]))
        .rows[0].enabled_at,
    ).toEqual(enabledAt);
    await store.upsert(context, { ...patch, enabled: false });
    expect(
      (await pool.query("select enabled_at from telegram_settings where organization_id=$1", [org]))
        .rows[0].enabled_at,
    ).toBeNull();
    const audit = await pool.query(
      "select count(*)::int n from resource_audit_events where organization_id=$1 and resource_type='telegram_settings'",
      [org],
    );
    expect(audit.rows[0].n).toBe(3);
    await expect(
      pool.query(
        "update telegram_settings set bot_token_encrypted=null,enabled=true where organization_id=$1",
        [org],
      ),
    ).rejects.toThrow(/enabled_complete/);
  });

  it("reports active worker errors and clears lastError once newer deliveries or test verification succeed (ERP-1014)", async () => {
    const store = new PgTelegramSettingsStore();
    await pool.query(
      "update telegram_settings set enabled=true, bot_token_encrypted='v1.cipher', updated_at=now()-interval '2 days' where organization_id=$1",
      [org],
    );

    const insertEvent = async (id: string, occurredInterval: string) => {
      await pool.query(
        `insert into outbox_events(organization_id,id,aggregate_type,aggregate_id,event_type,payload,correlation_id,occurred_at)
         values($1,$2,'expense',$2,'expense.created','{}'::jsonb,'c',now() - $3::interval)`,
        [org, id, occurredInterval],
      );
    };

    await insertEvent("ev-fail-old", "1 day");
    await pool.query(
      `insert into telegram_notifications(organization_id,outbox_event_id,state,attempts,next_attempt_at,last_error,created_at)
       values($1,'ev-fail-old','failed',5,now()-interval '23 hours 55 minutes','Telegram settings or bot token are unavailable',now()-interval '1 day')`,
      [org],
    );

    const withActiveFailure = await store.get(org);
    expect(withActiveFailure?.delivery).toMatchObject({
      sentLast7Days: 0,
      failed: 1,
      lastError: "Telegram settings or bot token are unavailable",
    });

    await insertEvent("ev-sent-newer", "2 hours");
    await pool.query(
      `insert into telegram_notifications(organization_id,outbox_event_id,state,attempts,sent_at,created_at)
       values($1,'ev-sent-newer','sent',1,now()-interval '2 hours',now()-interval '2 hours')`,
      [org],
    );

    const afterHealthySend = await store.get(org);
    expect(afterHealthySend?.delivery).toMatchObject({
      sentLast7Days: 1,
      failed: 1,
      lastError: null,
    });

    await insertEvent("ev-fail-new", "10 minutes");
    await pool.query(
      `insert into telegram_notifications(organization_id,outbox_event_id,state,attempts,next_attempt_at,last_error,created_at)
       values($1,'ev-fail-new','failed',1,now()-interval '5 minutes','Telegram HTTP 401: Unauthorized',now()-interval '10 minutes')`,
      [org],
    );

    expect((await store.get(org))?.delivery).toMatchObject({
      sentLast7Days: 1,
      failed: 2,
      lastError: "Telegram HTTP 401: Unauthorized",
    });

    await store.acknowledgeTestSuccess(org);
    expect((await store.get(org))?.delivery).toMatchObject({
      sentLast7Days: 1,
      failed: 2,
      lastError: null,
    });
  });
});
