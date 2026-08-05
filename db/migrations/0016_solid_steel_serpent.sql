CREATE TYPE "public"."outbound_attempt_outcome" AS ENUM('delivered', 'retryable_failure', 'permanent_failure', 'lease_expired');--> statement-breakpoint
CREATE TYPE "public"."outbound_delivery_state" AS ENUM('pending', 'leased', 'retry_scheduled', 'delivered', 'dead_letter');--> statement-breakpoint
CREATE TYPE "public"."outbound_subscription_status" AS ENUM('active', 'paused', 'disabled');--> statement-breakpoint
CREATE TABLE "outbound_deliveries" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"outbox_event_id" text NOT NULL,
	"subscription_id" text NOT NULL,
	"state" "outbound_delivery_state" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"leased_by" text,
	"lease_expires_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"dead_lettered_at" timestamp with time zone,
	"last_http_status" integer,
	"last_error_code" text,
	"last_error_summary" text,
	"manual_replay_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbound_deliveries_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "outbound_delivery_event_subscription_unique" UNIQUE("organization_id","outbox_event_id","subscription_id"),
	CONSTRAINT "outbound_delivery_attempt_count_nonnegative" CHECK ("outbound_deliveries"."attempt_count" >= 0),
	CONSTRAINT "outbound_delivery_replay_count_nonnegative" CHECK ("outbound_deliveries"."manual_replay_count" >= 0),
	CONSTRAINT "outbound_delivery_lease_pair" CHECK (("outbound_deliveries"."leased_by" is null) = ("outbound_deliveries"."lease_expires_at" is null))
);
--> statement-breakpoint
CREATE TABLE "outbound_delivery_attempts" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"delivery_id" text NOT NULL,
	"attempt_number" integer NOT NULL,
	"outcome" "outbound_attempt_outcome" NOT NULL,
	"worker_id" text NOT NULL,
	"http_status" integer,
	"response_summary" text,
	"error_code" text,
	"error_summary" text,
	"next_retry_at" timestamp with time zone,
	"is_manual_replay" boolean DEFAULT false NOT NULL,
	"replay_actor_id" text,
	"replay_reason" text,
	"correlation_id" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbound_delivery_attempts_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "outbound_attempts_number_unique" UNIQUE("organization_id","delivery_id","attempt_number"),
	CONSTRAINT "outbound_attempt_number_positive" CHECK ("outbound_delivery_attempts"."attempt_number" > 0),
	CONSTRAINT "outbound_attempt_completed_after_start" CHECK ("outbound_delivery_attempts"."completed_at" >= "outbound_delivery_attempts"."started_at"),
	CONSTRAINT "outbound_attempt_replay_metadata" CHECK (not "outbound_delivery_attempts"."is_manual_replay" or ("outbound_delivery_attempts"."replay_actor_id" is not null and btrim("outbound_delivery_attempts"."replay_reason") <> ''))
);
--> statement-breakpoint
CREATE TABLE "outbound_webhook_subscriptions" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"endpoint_url" text NOT NULL,
	"event_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"secret_ref" text NOT NULL,
	"status" "outbound_subscription_status" DEFAULT 'active' NOT NULL,
	"max_attempts" integer DEFAULT 8 NOT NULL,
	"timeout_seconds" integer DEFAULT 15 NOT NULL,
	"base_delay_seconds" integer DEFAULT 30 NOT NULL,
	"max_delay_seconds" integer DEFAULT 3600 NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbound_webhook_subscriptions_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "outbound_subscriptions_name_unique" UNIQUE("organization_id","name"),
	CONSTRAINT "outbound_subscription_name_not_blank" CHECK (btrim("outbound_webhook_subscriptions"."name") <> ''),
	CONSTRAINT "outbound_subscription_endpoint_https" CHECK ("outbound_webhook_subscriptions"."endpoint_url" ~ '^https://'),
	CONSTRAINT "outbound_subscription_secret_ref_not_blank" CHECK (btrim("outbound_webhook_subscriptions"."secret_ref") <> ''),
	CONSTRAINT "outbound_subscription_event_types_array" CHECK (jsonb_typeof("outbound_webhook_subscriptions"."event_types") = 'array'),
	CONSTRAINT "outbound_subscription_has_event_type" CHECK (jsonb_array_length("outbound_webhook_subscriptions"."event_types") > 0),
	CONSTRAINT "outbound_subscription_max_attempts_positive" CHECK ("outbound_webhook_subscriptions"."max_attempts" > 0),
	CONSTRAINT "outbound_subscription_timeout_positive" CHECK ("outbound_webhook_subscriptions"."timeout_seconds" > 0),
	CONSTRAINT "outbound_subscription_base_delay_positive" CHECK ("outbound_webhook_subscriptions"."base_delay_seconds" > 0),
	CONSTRAINT "outbound_subscription_delay_order" CHECK ("outbound_webhook_subscriptions"."max_delay_seconds" >= "outbound_webhook_subscriptions"."base_delay_seconds")
);
--> statement-breakpoint
ALTER TABLE "outbound_deliveries" ADD CONSTRAINT "outbound_deliveries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_deliveries" ADD CONSTRAINT "outbound_deliveries_organization_id_outbox_event_id_outbox_events_organization_id_id_fk" FOREIGN KEY ("organization_id","outbox_event_id") REFERENCES "public"."outbox_events"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_deliveries" ADD CONSTRAINT "outbound_deliveries_organization_id_subscription_id_outbound_webhook_subscriptions_organization_id_id_fk" FOREIGN KEY ("organization_id","subscription_id") REFERENCES "public"."outbound_webhook_subscriptions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_delivery_attempts" ADD CONSTRAINT "outbound_delivery_attempts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_delivery_attempts" ADD CONSTRAINT "outbound_delivery_attempts_organization_id_delivery_id_outbound_deliveries_organization_id_id_fk" FOREIGN KEY ("organization_id","delivery_id") REFERENCES "public"."outbound_deliveries"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_webhook_subscriptions" ADD CONSTRAINT "outbound_webhook_subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "outbound_deliveries_due_idx" ON "outbound_deliveries" ("state", "next_attempt_at", "created_at");
--> statement-breakpoint
CREATE INDEX "outbound_attempts_delivery_idx" ON "outbound_delivery_attempts" ("organization_id", "delivery_id", "attempt_number");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_outbound_attempt_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'outbound delivery attempts are append-only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER outbound_delivery_attempts_append_only
BEFORE UPDATE OR DELETE ON "outbound_delivery_attempts"
FOR EACH ROW EXECUTE FUNCTION prevent_outbound_attempt_mutation();
