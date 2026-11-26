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
});
