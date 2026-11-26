-- In-app Telegram notification settings per organization. The bot token is stored encrypted
-- (AES-256-GCM, key derived from SESSION_SECRET) and is never returned by the API.
CREATE TABLE "telegram_settings" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"enabled_at" timestamp with time zone,
	"chat_id" text,
	"thread_id" bigint,
	"bot_token_encrypted" text,
	"bot_token_hint" text,
	"notify_revenue" boolean DEFAULT true NOT NULL,
	"notify_expense" boolean DEFAULT true NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telegram_settings_org_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id"),
	CONSTRAINT "telegram_settings_version_positive" CHECK ("version" > 0),
	CONSTRAINT "telegram_settings_enabled_complete" CHECK (NOT "enabled" OR ("chat_id" IS NOT NULL AND "bot_token_encrypted" IS NOT NULL))
);
