CREATE TYPE "public"."bank_import_row_outcome" AS ENUM('imported', 'duplicate', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."bank_transaction_state" AS ENUM('imported', 'suggested', 'matched', 'reconciled', 'ignored', 'needs_review');--> statement-breakpoint
CREATE TYPE "public"."financial_account_kind" AS ENUM('bank', 'cash');--> statement-breakpoint
CREATE TYPE "public"."financial_account_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TABLE "bank_statement_import_rows" (
	"organization_id" text NOT NULL,
	"import_id" text NOT NULL,
	"row_number" integer NOT NULL,
	"raw_payload" jsonb NOT NULL,
	"raw_sha256" text NOT NULL,
	"outcome" "bank_import_row_outcome" NOT NULL,
	"error_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"transaction_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_statement_import_rows_organization_id_import_id_row_number_pk" PRIMARY KEY("organization_id","import_id","row_number"),
	CONSTRAINT "bank_statement_import_row_number" CHECK ("bank_statement_import_rows"."row_number" > 0),
	CONSTRAINT "bank_statement_import_row_sha" CHECK ("bank_statement_import_rows"."raw_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "bank_statement_import_row_transaction" CHECK (("bank_statement_import_rows"."outcome" = 'rejected' and "bank_statement_import_rows"."transaction_id" is null) or ("bank_statement_import_rows"."outcome" <> 'rejected' and "bank_statement_import_rows"."transaction_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "bank_statement_imports" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"financial_account_id" text NOT NULL,
	"adapter_id" text NOT NULL,
	"adapter_version" integer NOT NULL,
	"source_filename" text NOT NULL,
	"content_sha256" text NOT NULL,
	"row_count" integer NOT NULL,
	"imported_count" integer NOT NULL,
	"duplicate_count" integer NOT NULL,
	"rejected_count" integer NOT NULL,
	"created_by" text NOT NULL,
	"correlation_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_statement_imports_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "bank_statement_import_content_unique" UNIQUE("organization_id","financial_account_id","content_sha256"),
	CONSTRAINT "bank_statement_import_adapter" CHECK (btrim("bank_statement_imports"."adapter_id") <> ''),
	CONSTRAINT "bank_statement_import_adapter_version" CHECK ("bank_statement_imports"."adapter_version" > 0),
	CONSTRAINT "bank_statement_import_filename" CHECK (btrim("bank_statement_imports"."source_filename") <> ''),
	CONSTRAINT "bank_statement_import_sha" CHECK ("bank_statement_imports"."content_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "bank_statement_import_counts" CHECK ("bank_statement_imports"."row_count" >= 0 and "bank_statement_imports"."imported_count" >= 0 and "bank_statement_imports"."duplicate_count" >= 0 and "bank_statement_imports"."rejected_count" >= 0 and "bank_statement_imports"."row_count" = "bank_statement_imports"."imported_count" + "bank_statement_imports"."duplicate_count" + "bank_statement_imports"."rejected_count")
);
--> statement-breakpoint
CREATE TABLE "bank_transaction_events" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"transaction_id" text NOT NULL,
	"action" text NOT NULL,
	"from_state" "bank_transaction_state",
	"to_state" "bank_transaction_state" NOT NULL,
	"actor_id" text NOT NULL,
	"reason" text NOT NULL,
	"correlation_id" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_transaction_events_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "bank_transaction_event_action" CHECK (btrim("bank_transaction_events"."action") <> ''),
	CONSTRAINT "bank_transaction_event_reason" CHECK (btrim("bank_transaction_events"."reason") <> '')
);
--> statement-breakpoint
CREATE TABLE "bank_transaction_normalizations" (
	"organization_id" text NOT NULL,
	"transaction_id" text NOT NULL,
	"version" integer NOT NULL,
	"adapter_id" text NOT NULL,
	"adapter_version" integer NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"normalized_payload" jsonb NOT NULL,
	"normalized_sha256" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_transaction_normalizations_organization_id_transaction_id_version_pk" PRIMARY KEY("organization_id","transaction_id","version"),
	CONSTRAINT "bank_transaction_normalization_version" CHECK ("bank_transaction_normalizations"."version" > 0),
	CONSTRAINT "bank_transaction_normalization_adapter_version" CHECK ("bank_transaction_normalizations"."adapter_version" > 0),
	CONSTRAINT "bank_transaction_normalization_schema_version" CHECK ("bank_transaction_normalizations"."schema_version" > 0),
	CONSTRAINT "bank_transaction_normalization_sha" CHECK ("bank_transaction_normalizations"."normalized_sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "bank_transactions" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"financial_account_id" text NOT NULL,
	"provider_transaction_id" text,
	"fingerprint" text NOT NULL,
	"fingerprint_version" integer DEFAULT 1 NOT NULL,
	"booking_date" date NOT NULL,
	"value_date" date,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"reference" text,
	"description" text NOT NULL,
	"counterparty_name" text,
	"state" "bank_transaction_state" DEFAULT 'imported' NOT NULL,
	"current_normalization_version" integer DEFAULT 1 NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_transactions_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "bank_transaction_fingerprint_unique" UNIQUE("organization_id","financial_account_id","fingerprint"),
	CONSTRAINT "bank_transaction_fingerprint" CHECK ("bank_transactions"."fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "bank_transaction_fingerprint_version" CHECK ("bank_transactions"."fingerprint_version" > 0),
	CONSTRAINT "bank_transaction_amount_nonzero" CHECK ("bank_transactions"."amount_minor" <> 0),
	CONSTRAINT "bank_transaction_currency_iso3" CHECK ("bank_transactions"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "bank_transaction_description" CHECK (btrim("bank_transactions"."description") <> ''),
	CONSTRAINT "bank_transaction_normalization_version" CHECK ("bank_transactions"."current_normalization_version" > 0),
	CONSTRAINT "bank_transaction_version" CHECK ("bank_transactions"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "financial_accounts" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"code" text NOT NULL,
	"kind" "financial_account_kind" NOT NULL,
	"display_name" text NOT NULL,
	"currency" text NOT NULL,
	"ledger_account_code" text NOT NULL,
	"bank_code" text,
	"masked_identifier" text,
	"account_identity_hash" text,
	"status" "financial_account_status" DEFAULT 'active' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_accounts_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "financial_accounts_org_code_unique" UNIQUE("organization_id","code"),
	CONSTRAINT "financial_accounts_code_not_blank" CHECK (btrim("financial_accounts"."code") <> ''),
	CONSTRAINT "financial_accounts_name_not_blank" CHECK (btrim("financial_accounts"."display_name") <> ''),
	CONSTRAINT "financial_accounts_currency_iso3" CHECK ("financial_accounts"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "financial_accounts_bank_metadata" CHECK ("financial_accounts"."kind" = 'cash' or ("financial_accounts"."bank_code" is not null and btrim("financial_accounts"."bank_code") <> '')),
	CONSTRAINT "financial_accounts_identity_hash" CHECK ("financial_accounts"."account_identity_hash" is null or "financial_accounts"."account_identity_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "financial_accounts_version_positive" CHECK ("financial_accounts"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "bank_statement_import_rows" ADD CONSTRAINT "bank_statement_import_rows_import_fk" FOREIGN KEY ("organization_id","import_id") REFERENCES "public"."bank_statement_imports"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_import_rows" ADD CONSTRAINT "bank_statement_import_rows_transaction_fk" FOREIGN KEY ("organization_id","transaction_id") REFERENCES "public"."bank_transactions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_imports" ADD CONSTRAINT "bank_statement_imports_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_imports" ADD CONSTRAINT "bank_statement_import_account_fk" FOREIGN KEY ("organization_id","financial_account_id") REFERENCES "public"."financial_accounts"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transaction_events" ADD CONSTRAINT "bank_transaction_events_transaction_fk" FOREIGN KEY ("organization_id","transaction_id") REFERENCES "public"."bank_transactions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transaction_normalizations" ADD CONSTRAINT "bank_transaction_normalization_transaction_fk" FOREIGN KEY ("organization_id","transaction_id") REFERENCES "public"."bank_transactions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_account_fk" FOREIGN KEY ("organization_id","financial_account_id") REFERENCES "public"."financial_accounts"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_ledger_account_fk" FOREIGN KEY ("organization_id","ledger_account_code") REFERENCES "public"."accounts"("organization_id","code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bank_transaction_provider_id_unique" ON "bank_transactions" USING btree ("organization_id","financial_account_id","provider_transaction_id") WHERE "bank_transactions"."provider_transaction_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "financial_accounts_identity_unique" ON "financial_accounts" USING btree ("organization_id","account_identity_hash") WHERE "financial_accounts"."account_identity_hash" is not null;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_bank_import_history_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'bank import history is append-only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER bank_statement_import_rows_append_only
BEFORE UPDATE OR DELETE ON "bank_statement_import_rows"
FOR EACH ROW EXECUTE FUNCTION prevent_bank_import_history_mutation();
--> statement-breakpoint
CREATE TRIGGER bank_transaction_normalizations_append_only
BEFORE UPDATE OR DELETE ON "bank_transaction_normalizations"
FOR EACH ROW EXECUTE FUNCTION prevent_bank_import_history_mutation();
--> statement-breakpoint
CREATE TRIGGER bank_transaction_events_append_only
BEFORE UPDATE OR DELETE ON "bank_transaction_events"
FOR EACH ROW EXECUTE FUNCTION prevent_bank_import_history_mutation();
