CREATE TYPE "public"."inbound_attempt_outcome" AS ENUM('processed', 'quarantined', 'retryable_failure', 'dead_letter');--> statement-breakpoint
CREATE TYPE "public"."inbound_message_state" AS ENUM('received', 'processed', 'quarantined', 'retry_scheduled', 'dead_letter');--> statement-breakpoint
CREATE TABLE "inbound_message_attempts" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"message_id" text NOT NULL,
	"attempt_number" integer NOT NULL,
	"outcome" "inbound_attempt_outcome" NOT NULL,
	"actor_id" text NOT NULL,
	"reason" text,
	"error_code" text,
	"error_summary" text,
	"correlation_id" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inbound_message_attempts_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "inbound_attempts_number_unique" UNIQUE("organization_id","message_id","attempt_number"),
	CONSTRAINT "inbound_attempts_number" CHECK ("inbound_message_attempts"."attempt_number" > 0)
);
--> statement-breakpoint
CREATE TABLE "inbound_messages" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"source_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"external_id" text,
	"event_type" text,
	"schema_version" integer,
	"raw_payload" jsonb NOT NULL,
	"corrected_payload" jsonb,
	"payload_sha256" text NOT NULL,
	"signature_timestamp" bigint NOT NULL,
	"state" "inbound_message_state" DEFAULT 'received' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"last_error_code" text,
	"last_error_summary" text,
	"result_body" jsonb,
	"correlation_id" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inbound_messages_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "inbound_messages_idempotency_unique" UNIQUE("organization_id","source_id","idempotency_key"),
	CONSTRAINT "inbound_messages_external_unique" UNIQUE("organization_id","source_id","event_type","external_id"),
	CONSTRAINT "inbound_messages_hash" CHECK ("inbound_messages"."payload_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "inbound_messages_attempts" CHECK ("inbound_messages"."attempt_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "integration_sources" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"public_id" text NOT NULL,
	"name" text NOT NULL,
	"actor_id" text NOT NULL,
	"secret_ref" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"allowed_event_types" jsonb NOT NULL,
	"timestamp_tolerance_seconds" integer DEFAULT 300 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integration_sources_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "integration_sources_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "integration_sources_status" CHECK ("integration_sources"."status" in ('active','suspended','revoked')),
	CONSTRAINT "integration_sources_tolerance" CHECK ("integration_sources"."timestamp_tolerance_seconds" between 30 and 900),
	CONSTRAINT "integration_sources_attempts" CHECK ("integration_sources"."max_attempts" between 1 and 20)
);
--> statement-breakpoint
ALTER TABLE "inbound_message_attempts" ADD CONSTRAINT "inbound_attempts_message_fk" FOREIGN KEY ("organization_id","message_id") REFERENCES "public"."inbound_messages"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_messages" ADD CONSTRAINT "inbound_messages_source_fk" FOREIGN KEY ("organization_id","source_id") REFERENCES "public"."integration_sources"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_sources" ADD CONSTRAINT "integration_sources_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE FUNCTION prevent_inbound_raw_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.source_id IS DISTINCT FROM OLD.source_id OR
     NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key OR NEW.external_id IS DISTINCT FROM OLD.external_id OR
     NEW.event_type IS DISTINCT FROM OLD.event_type OR NEW.schema_version IS DISTINCT FROM OLD.schema_version OR
     NEW.raw_payload IS DISTINCT FROM OLD.raw_payload OR NEW.payload_sha256 IS DISTINCT FROM OLD.payload_sha256 OR
     NEW.signature_timestamp IS DISTINCT FROM OLD.signature_timestamp OR NEW.correlation_id IS DISTINCT FROM OLD.correlation_id OR
     NEW.received_at IS DISTINCT FROM OLD.received_at THEN
    RAISE EXCEPTION 'INBOUND_RAW_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER inbound_messages_raw_immutable BEFORE UPDATE ON inbound_messages
FOR EACH ROW EXECUTE FUNCTION prevent_inbound_raw_mutation();
--> statement-breakpoint
CREATE FUNCTION prevent_inbound_attempt_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'INBOUND_ATTEMPT_APPEND_ONLY' USING ERRCODE = '55000';
END $$;
--> statement-breakpoint
CREATE TRIGGER inbound_attempts_append_only BEFORE UPDATE OR DELETE ON inbound_message_attempts
FOR EACH ROW EXECUTE FUNCTION prevent_inbound_attempt_mutation();
