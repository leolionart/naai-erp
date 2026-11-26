-- Telegram notification queue for posted revenue/expense journals (worker-owned, idempotent per event).
CREATE TABLE "telegram_notifications" (
	"organization_id" text NOT NULL,
	"outbox_event_id" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telegram_notifications_pk" PRIMARY KEY("organization_id","outbox_event_id"),
	CONSTRAINT "telegram_notifications_event_fk" FOREIGN KEY ("organization_id","outbox_event_id") REFERENCES "public"."outbox_events"("organization_id","id"),
	CONSTRAINT "telegram_notifications_state_valid" CHECK ("state" in ('pending','sent','skipped','failed')),
	CONSTRAINT "telegram_notifications_attempts_nonnegative" CHECK ("attempts" >= 0)
);
--> statement-breakpoint
CREATE INDEX "telegram_notifications_due_idx" ON "telegram_notifications" ("state","next_attempt_at");
