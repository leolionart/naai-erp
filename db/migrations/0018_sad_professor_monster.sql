CREATE TYPE "public"."journal_side" AS ENUM('debit', 'credit');--> statement-breakpoint
CREATE TYPE "public"."reconciliation_adjustment_kind" AS ENUM('bank_fee', 'fx_gain', 'fx_loss', 'suspense');--> statement-breakpoint
CREATE TYPE "public"."reconciliation_attempt_state" AS ENUM('matched', 'reconciled', 'unreconciled');--> statement-breakpoint
CREATE TYPE "public"."reconciliation_candidate_status" AS ENUM('proposed', 'accepted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."reconciliation_target_type" AS ENUM('commercial_document', 'expense');--> statement-breakpoint
CREATE TABLE "payment_reconciliations" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"reconciliation_id" text NOT NULL,
	"attempt_number" integer NOT NULL,
	"bank_transaction_id" text NOT NULL,
	"direction" text NOT NULL,
	"statement_amount_minor" bigint NOT NULL,
	"statement_currency" text NOT NULL,
	"current_attempt_number" integer DEFAULT 0 NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_reconciliations_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "payment_reconciliation_transaction_unique" UNIQUE("organization_id","bank_transaction_id"),
	CONSTRAINT "payment_reconciliation_direction" CHECK ("payment_reconciliations"."direction" in ('receipt','payment')),
	CONSTRAINT "payment_reconciliation_statement_amount" CHECK ("payment_reconciliations"."statement_amount_minor" > 0),
	CONSTRAINT "payment_reconciliation_currency" CHECK ("payment_reconciliations"."statement_currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "payment_reconciliation_attempt_number" CHECK ("payment_reconciliations"."current_attempt_number" >= 0),
	CONSTRAINT "payment_reconciliation_version" CHECK ("payment_reconciliations"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "reconciliation_adjustments" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"line_number" integer NOT NULL,
	"reconciliation_id" text NOT NULL,
	"kind" "reconciliation_adjustment_kind" NOT NULL,
	"base_amount_minor" bigint NOT NULL,
	"statement_amount_minor" bigint NOT NULL,
	"account_code" text NOT NULL,
	"side" "journal_side" NOT NULL,
	"description" text NOT NULL,
	"exchange_rate_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reconciliation_adjustments_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "reconciliation_adjustment_line_unique" UNIQUE("organization_id","reconciliation_id","line_number"),
	CONSTRAINT "reconciliation_adjustment_line" CHECK ("reconciliation_adjustments"."line_number" > 0),
	CONSTRAINT "reconciliation_adjustment_amount" CHECK ("reconciliation_adjustments"."base_amount_minor" > 0),
	CONSTRAINT "reconciliation_adjustment_statement_amount" CHECK ("reconciliation_adjustments"."statement_amount_minor" >= 0),
	CONSTRAINT "reconciliation_adjustment_description" CHECK (btrim("reconciliation_adjustments"."description") <> '')
);
--> statement-breakpoint
CREATE TABLE "reconciliation_allocations" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"line_number" integer NOT NULL,
	"reconciliation_id" text NOT NULL,
	"target_type" "reconciliation_target_type" NOT NULL,
	"commercial_document_id" text,
	"expense_id" text,
	"target_amount_minor" bigint NOT NULL,
	"target_currency" text NOT NULL,
	"base_amount_minor" bigint NOT NULL,
	"statement_amount_minor" bigint NOT NULL,
	"target_outstanding_before_minor" bigint NOT NULL,
	"exchange_rate_id" text,
	"control_account_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reconciliation_allocations_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "reconciliation_allocation_line_unique" UNIQUE("organization_id","reconciliation_id","line_number"),
	CONSTRAINT "reconciliation_allocation_line" CHECK ("reconciliation_allocations"."line_number" > 0),
	CONSTRAINT "reconciliation_allocation_target_amount" CHECK ("reconciliation_allocations"."target_amount_minor" > 0),
	CONSTRAINT "reconciliation_allocation_base_amount" CHECK ("reconciliation_allocations"."base_amount_minor" > 0),
	CONSTRAINT "reconciliation_allocation_statement_amount" CHECK ("reconciliation_allocations"."statement_amount_minor" > 0),
	CONSTRAINT "reconciliation_allocation_outstanding" CHECK ("reconciliation_allocations"."target_outstanding_before_minor" > 0),
	CONSTRAINT "reconciliation_allocation_currency" CHECK ("reconciliation_allocations"."target_currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "reconciliation_allocation_target" CHECK (("reconciliation_allocations"."target_type" = 'commercial_document' and "reconciliation_allocations"."commercial_document_id" is not null and "reconciliation_allocations"."expense_id" is null) or ("reconciliation_allocations"."target_type" = 'expense' and "reconciliation_allocations"."expense_id" is not null and "reconciliation_allocations"."commercial_document_id" is null))
);
--> statement-breakpoint
CREATE TABLE "reconciliation_attempts" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"reconciliation_id" text NOT NULL,
	"attempt_number" integer NOT NULL,
	"bank_transaction_id" text NOT NULL,
	"state" "reconciliation_attempt_state" DEFAULT 'matched' NOT NULL,
	"bank_amount_minor" bigint NOT NULL,
	"bank_currency" text NOT NULL,
	"base_amount_minor" bigint NOT NULL,
	"exchange_rate_id" text,
	"candidate_run_id" text,
	"policy_version" integer DEFAULT 1 NOT NULL,
	"candidate_generation" integer NOT NULL,
	"manual_override" boolean DEFAULT false NOT NULL,
	"override_reason" text,
	"override_reference" text,
	"journal_id" text,
	"reversal_journal_id" text,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"matched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reconciled_by" text,
	"reconciled_at" timestamp with time zone,
	"reconciled_reason" text,
	"unreconciled_by" text,
	"unreconciled_at" timestamp with time zone,
	"unreconciled_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reconciliation_attempts_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "reconciliation_attempt_number_unique" UNIQUE("organization_id","reconciliation_id","attempt_number"),
	CONSTRAINT "reconciliation_attempt_bank_amount" CHECK ("reconciliation_attempts"."bank_amount_minor" > 0),
	CONSTRAINT "reconciliation_attempt_base_amount" CHECK ("reconciliation_attempts"."base_amount_minor" > 0),
	CONSTRAINT "reconciliation_attempt_currency" CHECK ("reconciliation_attempts"."bank_currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "reconciliation_attempt_version" CHECK ("reconciliation_attempts"."version" > 0),
	CONSTRAINT "reconciliation_attempt_number" CHECK ("reconciliation_attempts"."attempt_number" > 0),
	CONSTRAINT "reconciliation_attempt_policy" CHECK ("reconciliation_attempts"."policy_version" > 0),
	CONSTRAINT "reconciliation_attempt_generation" CHECK ("reconciliation_attempts"."candidate_generation" > 0),
	CONSTRAINT "reconciliation_attempt_override" CHECK (not "reconciliation_attempts"."manual_override" or ("reconciliation_attempts"."override_reason" is not null and btrim("reconciliation_attempts"."override_reason") <> ''))
);
--> statement-breakpoint
CREATE TABLE "reconciliation_candidate_runs" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"bank_transaction_id" text NOT NULL,
	"algorithm_version" integer DEFAULT 1 NOT NULL,
	"threshold_bps" integer NOT NULL,
	"ambiguity_margin_bps" integer NOT NULL,
	"created_by" text NOT NULL,
	"correlation_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reconciliation_candidate_runs_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "reconciliation_candidate_algorithm" CHECK ("reconciliation_candidate_runs"."algorithm_version" > 0),
	CONSTRAINT "reconciliation_candidate_threshold" CHECK ("reconciliation_candidate_runs"."threshold_bps" between 0 and 10000),
	CONSTRAINT "reconciliation_candidate_margin" CHECK ("reconciliation_candidate_runs"."ambiguity_margin_bps" between 0 and 10000)
);
--> statement-breakpoint
CREATE TABLE "reconciliation_candidates" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"run_id" text NOT NULL,
	"rank" integer NOT NULL,
	"target_type" "reconciliation_target_type" NOT NULL,
	"commercial_document_id" text,
	"expense_id" text,
	"confidence_bps" integer NOT NULL,
	"factors" jsonb NOT NULL,
	"outstanding_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"status" "reconciliation_candidate_status" DEFAULT 'proposed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reconciliation_candidates_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "reconciliation_candidate_run_rank_unique" UNIQUE("organization_id","run_id","rank"),
	CONSTRAINT "reconciliation_candidate_rank" CHECK ("reconciliation_candidates"."rank" > 0),
	CONSTRAINT "reconciliation_candidate_confidence" CHECK ("reconciliation_candidates"."confidence_bps" between 0 and 10000),
	CONSTRAINT "reconciliation_candidate_outstanding" CHECK ("reconciliation_candidates"."outstanding_minor" > 0),
	CONSTRAINT "reconciliation_candidate_currency" CHECK ("reconciliation_candidates"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "reconciliation_candidate_target" CHECK (("reconciliation_candidates"."target_type" = 'commercial_document' and "reconciliation_candidates"."commercial_document_id" is not null and "reconciliation_candidates"."expense_id" is null) or ("reconciliation_candidates"."target_type" = 'expense' and "reconciliation_candidates"."expense_id" is not null and "reconciliation_candidates"."commercial_document_id" is null))
);
--> statement-breakpoint
CREATE TABLE "reconciliation_events" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"reconciliation_id" text,
	"bank_transaction_id" text NOT NULL,
	"action" text NOT NULL,
	"from_state" text,
	"to_state" text NOT NULL,
	"actor_id" text NOT NULL,
	"reason" text NOT NULL,
	"correlation_id" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reconciliation_events_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "reconciliation_event_action" CHECK (btrim("reconciliation_events"."action") <> ''),
	CONSTRAINT "reconciliation_event_reason" CHECK (btrim("reconciliation_events"."reason") <> '')
);
--> statement-breakpoint
ALTER TABLE "payment_reconciliations" ADD CONSTRAINT "payment_reconciliations_transaction_fk" FOREIGN KEY ("organization_id","bank_transaction_id") REFERENCES "public"."bank_transactions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_adjustments" ADD CONSTRAINT "reconciliation_adjustments_attempt_fk" FOREIGN KEY ("organization_id","reconciliation_id") REFERENCES "public"."reconciliation_attempts"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_adjustments" ADD CONSTRAINT "reconciliation_adjustments_account_fk" FOREIGN KEY ("organization_id","account_code") REFERENCES "public"."accounts"("organization_id","code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_adjustments" ADD CONSTRAINT "reconciliation_adjustments_exchange_rate_fk" FOREIGN KEY ("organization_id","exchange_rate_id") REFERENCES "public"."exchange_rates"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_allocations" ADD CONSTRAINT "reconciliation_allocations_attempt_fk" FOREIGN KEY ("organization_id","reconciliation_id") REFERENCES "public"."reconciliation_attempts"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_allocations" ADD CONSTRAINT "reconciliation_allocations_document_fk" FOREIGN KEY ("organization_id","commercial_document_id") REFERENCES "public"."commercial_documents"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_allocations" ADD CONSTRAINT "reconciliation_allocations_expense_fk" FOREIGN KEY ("organization_id","expense_id") REFERENCES "public"."expenses"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_allocations" ADD CONSTRAINT "reconciliation_allocations_account_fk" FOREIGN KEY ("organization_id","control_account_code") REFERENCES "public"."accounts"("organization_id","code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_allocations" ADD CONSTRAINT "reconciliation_allocations_exchange_rate_fk" FOREIGN KEY ("organization_id","exchange_rate_id") REFERENCES "public"."exchange_rates"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_attempts" ADD CONSTRAINT "reconciliation_attempts_parent_fk" FOREIGN KEY ("organization_id","reconciliation_id") REFERENCES "public"."payment_reconciliations"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_attempts" ADD CONSTRAINT "reconciliation_attempts_transaction_fk" FOREIGN KEY ("organization_id","bank_transaction_id") REFERENCES "public"."bank_transactions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_attempts" ADD CONSTRAINT "reconciliation_attempts_exchange_rate_fk" FOREIGN KEY ("organization_id","exchange_rate_id") REFERENCES "public"."exchange_rates"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_attempts" ADD CONSTRAINT "reconciliation_attempts_candidate_run_fk" FOREIGN KEY ("organization_id","candidate_run_id") REFERENCES "public"."reconciliation_candidate_runs"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_attempts" ADD CONSTRAINT "reconciliation_attempts_journal_fk" FOREIGN KEY ("organization_id","journal_id") REFERENCES "public"."journal_entries"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_attempts" ADD CONSTRAINT "reconciliation_attempts_reversal_journal_fk" FOREIGN KEY ("organization_id","reversal_journal_id") REFERENCES "public"."journal_entries"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_candidate_runs" ADD CONSTRAINT "reconciliation_candidate_runs_transaction_fk" FOREIGN KEY ("organization_id","bank_transaction_id") REFERENCES "public"."bank_transactions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_candidates" ADD CONSTRAINT "reconciliation_candidates_run_fk" FOREIGN KEY ("organization_id","run_id") REFERENCES "public"."reconciliation_candidate_runs"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_candidates" ADD CONSTRAINT "reconciliation_candidates_document_fk" FOREIGN KEY ("organization_id","commercial_document_id") REFERENCES "public"."commercial_documents"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_candidates" ADD CONSTRAINT "reconciliation_candidates_expense_fk" FOREIGN KEY ("organization_id","expense_id") REFERENCES "public"."expenses"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_events" ADD CONSTRAINT "reconciliation_events_attempt_fk" FOREIGN KEY ("organization_id","reconciliation_id") REFERENCES "public"."reconciliation_attempts"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_events" ADD CONSTRAINT "reconciliation_events_transaction_fk" FOREIGN KEY ("organization_id","bank_transaction_id") REFERENCES "public"."bank_transactions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reconciliation_attempt_active_transaction_unique" ON "reconciliation_attempts" USING btree ("organization_id","bank_transaction_id") WHERE "reconciliation_attempts"."state" in ('matched','reconciled');
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_reconciliation_history_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'reconciliation history is append-only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER reconciliation_candidate_runs_append_only BEFORE UPDATE OR DELETE ON "reconciliation_candidate_runs" FOR EACH ROW EXECUTE FUNCTION prevent_reconciliation_history_mutation();
--> statement-breakpoint
CREATE TRIGGER reconciliation_candidates_append_only BEFORE UPDATE OR DELETE ON "reconciliation_candidates" FOR EACH ROW EXECUTE FUNCTION prevent_reconciliation_history_mutation();
--> statement-breakpoint
CREATE TRIGGER reconciliation_allocations_append_only BEFORE UPDATE OR DELETE ON "reconciliation_allocations" FOR EACH ROW EXECUTE FUNCTION prevent_reconciliation_history_mutation();
--> statement-breakpoint
CREATE TRIGGER reconciliation_adjustments_append_only BEFORE UPDATE OR DELETE ON "reconciliation_adjustments" FOR EACH ROW EXECUTE FUNCTION prevent_reconciliation_history_mutation();
--> statement-breakpoint
CREATE TRIGGER reconciliation_events_append_only BEFORE UPDATE OR DELETE ON "reconciliation_events" FOR EACH ROW EXECUTE FUNCTION prevent_reconciliation_history_mutation();
