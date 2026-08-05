CREATE TYPE "public"."journal_state" AS ENUM('draft', 'approved', 'posted', 'reversed');--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"journal_date" date NOT NULL,
	"description" text NOT NULL,
	"currency" text NOT NULL,
	"state" "journal_state" DEFAULT 'draft' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"posted_at" timestamp with time zone,
	"posted_by" text,
	"reversal_of_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_entries_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "journal_entries_org_reversal_unique" UNIQUE("organization_id","reversal_of_id"),
	CONSTRAINT "journal_entries_description_not_blank" CHECK (btrim("journal_entries"."description") <> ''),
	CONSTRAINT "journal_entries_currency_iso3" CHECK ("journal_entries"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "journal_entries_version_positive" CHECK ("journal_entries"."version" > 0),
	CONSTRAINT "journal_entries_posting_metadata" CHECK (("journal_entries"."state" in ('posted','reversed') and "journal_entries"."posted_at" is not null and "journal_entries"."posted_by" is not null) or ("journal_entries"."state" in ('draft','approved') and "journal_entries"."posted_at" is null and "journal_entries"."posted_by" is null))
);
--> statement-breakpoint
CREATE TABLE "journal_lines" (
	"organization_id" text NOT NULL,
	"journal_id" text NOT NULL,
	"line_number" integer NOT NULL,
	"account_code" text NOT NULL,
	"debit_minor" bigint,
	"credit_minor" bigint,
	"description" text,
	"dimensions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_lines_organization_id_journal_id_line_number_pk" PRIMARY KEY("organization_id","journal_id","line_number"),
	CONSTRAINT "journal_lines_number_positive" CHECK ("journal_lines"."line_number" > 0),
	CONSTRAINT "journal_lines_debit_xor_credit" CHECK (("journal_lines"."debit_minor" is not null and "journal_lines"."debit_minor" > 0 and "journal_lines"."credit_minor" is null) or ("journal_lines"."credit_minor" is not null and "journal_lines"."credit_minor" > 0 and "journal_lines"."debit_minor" is null))
);
--> statement-breakpoint
CREATE TABLE "journal_posting_commands" (
	"organization_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"journal_id" text NOT NULL,
	"request_hash" text NOT NULL,
	"response_body" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_posting_commands_organization_id_idempotency_key_pk" PRIMARY KEY("organization_id","idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"event_type" text NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"payload" jsonb NOT NULL,
	"correlation_id" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "outbox_events_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "outbox_schema_version_positive" CHECK ("outbox_events"."schema_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_reversal_of_fk" FOREIGN KEY ("organization_id","reversal_of_id") REFERENCES "public"."journal_entries"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_journal_fk" FOREIGN KEY ("organization_id","journal_id") REFERENCES "public"."journal_entries"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_fk" FOREIGN KEY ("organization_id","account_code") REFERENCES "public"."accounts"("organization_id","code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_posting_commands" ADD CONSTRAINT "journal_posting_commands_journal_fk" FOREIGN KEY ("organization_id","journal_id") REFERENCES "public"."journal_entries"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE FUNCTION prevent_posted_journal_mutation() RETURNS trigger AS $$
BEGIN
  IF OLD.state IN ('posted', 'reversed') THEN
    RAISE EXCEPTION 'posted journals are immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER journal_entries_immutable_after_post BEFORE UPDATE OR DELETE ON journal_entries
FOR EACH ROW EXECUTE FUNCTION prevent_posted_journal_mutation();
--> statement-breakpoint
CREATE FUNCTION prevent_posted_journal_line_mutation() RETURNS trigger AS $$
DECLARE current_state journal_state;
BEGIN
  SELECT state INTO current_state FROM journal_entries
  WHERE organization_id = COALESCE(OLD.organization_id, NEW.organization_id)
    AND id = COALESCE(OLD.journal_id, NEW.journal_id);
  IF current_state IN ('posted', 'reversed') THEN
    RAISE EXCEPTION 'posted journal lines are immutable' USING ERRCODE = '55000';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER journal_lines_immutable_after_post BEFORE UPDATE OR DELETE ON journal_lines
FOR EACH ROW EXECUTE FUNCTION prevent_posted_journal_line_mutation();
