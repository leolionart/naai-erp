CREATE TYPE "public"."internal_transfer_attempt_state" AS ENUM('pending_counterpart', 'matched', 'reconciled', 'unmatched', 'needs_review');--> statement-breakpoint
CREATE TYPE "public"."internal_transfer_state" AS ENUM('pending_counterpart', 'matched', 'reconciled', 'unmatched', 'needs_review');--> statement-breakpoint
CREATE TABLE "internal_transfer_attempts" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"transfer_id" text NOT NULL,
	"attempt_number" integer NOT NULL,
	"state" "internal_transfer_attempt_state" NOT NULL,
	"posting_mode" text DEFAULT 'transit' NOT NULL,
	"fee" jsonb,
	"outgoing_transaction_id" text,
	"incoming_transaction_id" text,
	"fee_transaction_id" text,
	"outgoing_journal_id" text,
	"incoming_journal_id" text,
	"outgoing_reversal_journal_id" text,
	"incoming_reversal_journal_id" text,
	"fee_reversal_journal_id" text,
	"manual_override_reason" text,
	"matched_by" text,
	"matched_at" timestamp with time zone,
	"unmatched_by" text,
	"unmatched_at" timestamp with time zone,
	"unmatched_reason" text,
	"correlation_id" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "internal_transfer_attempts_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "internal_transfer_attempt_number_unique" UNIQUE("organization_id","transfer_id","attempt_number"),
	CONSTRAINT "internal_transfer_attempt_number" CHECK ("internal_transfer_attempts"."attempt_number" > 0),
	CONSTRAINT "internal_transfer_attempt_posting_mode" CHECK ("internal_transfer_attempts"."posting_mode" in ('direct','transit')),
	CONSTRAINT "internal_transfer_attempt_has_leg" CHECK ("internal_transfer_attempts"."outgoing_transaction_id" is not null or "internal_transfer_attempts"."incoming_transaction_id" is not null),
	CONSTRAINT "internal_transfer_attempt_distinct_legs" CHECK ("internal_transfer_attempts"."outgoing_transaction_id" is null or "internal_transfer_attempts"."incoming_transaction_id" is null or "internal_transfer_attempts"."outgoing_transaction_id" <> "internal_transfer_attempts"."incoming_transaction_id"),
	CONSTRAINT "internal_transfer_attempt_matched_legs" CHECK ("internal_transfer_attempts"."state" not in ('matched','reconciled') or ("internal_transfer_attempts"."outgoing_transaction_id" is not null and "internal_transfer_attempts"."incoming_transaction_id" is not null and "internal_transfer_attempts"."matched_by" is not null and "internal_transfer_attempts"."matched_at" is not null)),
	CONSTRAINT "internal_transfer_attempt_unmatched_metadata" CHECK ("internal_transfer_attempts"."state" <> 'unmatched' or ("internal_transfer_attempts"."unmatched_by" is not null and "internal_transfer_attempts"."unmatched_at" is not null and "internal_transfer_attempts"."unmatched_reason" is not null and btrim("internal_transfer_attempts"."unmatched_reason") <> ''))
);
--> statement-breakpoint
CREATE TABLE "internal_transfer_candidate_runs" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"bank_transaction_id" text NOT NULL,
	"created_by" text NOT NULL,
	"correlation_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "internal_transfer_candidate_runs_organization_id_id_pk" PRIMARY KEY("organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "internal_transfer_candidates" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"run_id" text NOT NULL,
	"counterpart_transaction_id" text NOT NULL,
	"score_bps" integer NOT NULL,
	"factors" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "internal_transfer_candidates_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "internal_transfer_candidate_counterpart_unique" UNIQUE("organization_id","run_id","counterpart_transaction_id"),
	CONSTRAINT "internal_transfer_candidate_score" CHECK ("internal_transfer_candidates"."score_bps" between 0 and 10000)
);
--> statement-breakpoint
CREATE TABLE "internal_transfer_claims" (
	"organization_id" text NOT NULL,
	"bank_transaction_id" text NOT NULL,
	"transfer_id" text NOT NULL,
	"attempt_number" integer NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "internal_transfer_claims_organization_id_bank_transaction_id_pk" PRIMARY KEY("organization_id","bank_transaction_id"),
	CONSTRAINT "internal_transfer_claim_role" CHECK ("internal_transfer_claims"."role" in ('source','destination','fee'))
);
--> statement-breakpoint
CREATE TABLE "internal_transfer_events" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"transfer_id" text NOT NULL,
	"attempt_number" integer NOT NULL,
	"action" text NOT NULL,
	"actor_id" text NOT NULL,
	"reason" text NOT NULL,
	"correlation_id" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "internal_transfer_events_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "internal_transfer_event_action" CHECK (btrim("internal_transfer_events"."action") <> ''),
	CONSTRAINT "internal_transfer_event_reason" CHECK (btrim("internal_transfer_events"."reason") <> '')
);
--> statement-breakpoint
CREATE TABLE "internal_transfers" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"state" "internal_transfer_state" DEFAULT 'pending_counterpart' NOT NULL,
	"currency" text NOT NULL,
	"transfer_amount_minor" bigint NOT NULL,
	"base_principal_amount_minor" bigint NOT NULL,
	"transit_account_code" text NOT NULL,
	"current_attempt_number" integer DEFAULT 1 NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "internal_transfers_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "internal_transfer_currency" CHECK ("internal_transfers"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "internal_transfer_amount" CHECK ("internal_transfers"."transfer_amount_minor" > 0),
	CONSTRAINT "internal_transfer_attempt_number" CHECK ("internal_transfers"."current_attempt_number" > 0),
	CONSTRAINT "internal_transfer_version" CHECK ("internal_transfers"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "internal_transfer_attempts" ADD CONSTRAINT "internal_transfer_attempts_transfer_fk" FOREIGN KEY ("organization_id","transfer_id") REFERENCES "public"."internal_transfers"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_transfer_attempts" ADD CONSTRAINT "internal_transfer_attempts_outgoing_fk" FOREIGN KEY ("organization_id","outgoing_transaction_id") REFERENCES "public"."bank_transactions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_transfer_attempts" ADD CONSTRAINT "internal_transfer_attempts_incoming_fk" FOREIGN KEY ("organization_id","incoming_transaction_id") REFERENCES "public"."bank_transactions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_transfer_attempts" ADD CONSTRAINT "internal_transfer_attempts_fee_transaction_fk" FOREIGN KEY ("organization_id","fee_transaction_id") REFERENCES "public"."bank_transactions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_transfer_attempts" ADD CONSTRAINT "internal_transfer_attempts_outgoing_journal_fk" FOREIGN KEY ("organization_id","outgoing_journal_id") REFERENCES "public"."journal_entries"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_transfer_attempts" ADD CONSTRAINT "internal_transfer_attempts_incoming_journal_fk" FOREIGN KEY ("organization_id","incoming_journal_id") REFERENCES "public"."journal_entries"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_transfer_attempts" ADD CONSTRAINT "internal_transfer_attempts_outgoing_reversal_fk" FOREIGN KEY ("organization_id","outgoing_reversal_journal_id") REFERENCES "public"."journal_entries"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_transfer_attempts" ADD CONSTRAINT "internal_transfer_attempts_incoming_reversal_fk" FOREIGN KEY ("organization_id","incoming_reversal_journal_id") REFERENCES "public"."journal_entries"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_transfer_attempts" ADD CONSTRAINT "internal_transfer_attempts_fee_reversal_fk" FOREIGN KEY ("organization_id","fee_reversal_journal_id") REFERENCES "public"."journal_entries"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_transfer_candidate_runs" ADD CONSTRAINT "internal_transfer_candidate_runs_transaction_fk" FOREIGN KEY ("organization_id","bank_transaction_id") REFERENCES "public"."bank_transactions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_transfer_candidates" ADD CONSTRAINT "internal_transfer_candidates_run_fk" FOREIGN KEY ("organization_id","run_id") REFERENCES "public"."internal_transfer_candidate_runs"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_transfer_candidates" ADD CONSTRAINT "internal_transfer_candidates_counterpart_fk" FOREIGN KEY ("organization_id","counterpart_transaction_id") REFERENCES "public"."bank_transactions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_transfer_claims" ADD CONSTRAINT "internal_transfer_claims_transaction_fk" FOREIGN KEY ("organization_id","bank_transaction_id") REFERENCES "public"."bank_transactions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_transfer_claims" ADD CONSTRAINT "internal_transfer_claims_attempt_fk" FOREIGN KEY ("organization_id","transfer_id","attempt_number") REFERENCES "public"."internal_transfer_attempts"("organization_id","transfer_id","attempt_number") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_transfer_events" ADD CONSTRAINT "internal_transfer_events_attempt_fk" FOREIGN KEY ("organization_id","transfer_id","attempt_number") REFERENCES "public"."internal_transfer_attempts"("organization_id","transfer_id","attempt_number") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_transfers" ADD CONSTRAINT "internal_transfers_transit_account_fk" FOREIGN KEY ("organization_id","transit_account_code") REFERENCES "public"."accounts"("organization_id","code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "internal_transfer_attempts_transfer_idx" ON "internal_transfer_attempts" USING btree ("organization_id","transfer_id","attempt_number");--> statement-breakpoint
CREATE INDEX "internal_transfer_attempts_outgoing_idx" ON "internal_transfer_attempts" USING btree ("organization_id","outgoing_transaction_id");--> statement-breakpoint
CREATE INDEX "internal_transfer_attempts_incoming_idx" ON "internal_transfer_attempts" USING btree ("organization_id","incoming_transaction_id");--> statement-breakpoint
CREATE INDEX "internal_transfer_attempts_fee_idx" ON "internal_transfer_attempts" USING btree ("organization_id","fee_transaction_id");--> statement-breakpoint
CREATE INDEX "internal_transfer_claims_transfer_idx" ON "internal_transfer_claims" USING btree ("organization_id","transfer_id","attempt_number");--> statement-breakpoint
CREATE INDEX "internal_transfers_state_idx" ON "internal_transfers" USING btree ("organization_id","state");--> statement-breakpoint
CREATE INDEX "internal_transfers_updated_idx" ON "internal_transfers" USING btree ("organization_id","updated_at");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_internal_transfer_history_mutation() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'internal transfer history is append-only'; END; $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER internal_transfer_attempts_append_only BEFORE UPDATE OR DELETE ON "internal_transfer_attempts" FOR EACH ROW EXECUTE FUNCTION prevent_internal_transfer_history_mutation();
--> statement-breakpoint
CREATE TRIGGER internal_transfer_candidate_runs_append_only BEFORE UPDATE OR DELETE ON "internal_transfer_candidate_runs" FOR EACH ROW EXECUTE FUNCTION prevent_internal_transfer_history_mutation();
--> statement-breakpoint
CREATE TRIGGER internal_transfer_candidates_append_only BEFORE UPDATE OR DELETE ON "internal_transfer_candidates" FOR EACH ROW EXECUTE FUNCTION prevent_internal_transfer_history_mutation();
--> statement-breakpoint
CREATE TRIGGER internal_transfer_events_append_only BEFORE UPDATE OR DELETE ON "internal_transfer_events" FOR EACH ROW EXECUTE FUNCTION prevent_internal_transfer_history_mutation();
