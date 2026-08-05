CREATE TABLE "opening_balance_imports" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"journal_id" text NOT NULL,
	"opening_date" date NOT NULL,
	"currency" text NOT NULL,
	"control_debit_minor" bigint NOT NULL,
	"control_credit_minor" bigint NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by" text NOT NULL,
	"correlation_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opening_balance_imports_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "opening_balance_imports_journal_unique" UNIQUE("organization_id","journal_id"),
	CONSTRAINT "opening_balance_imports_currency_iso3" CHECK ("opening_balance_imports"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "opening_balance_imports_balanced" CHECK ("opening_balance_imports"."control_debit_minor" = "opening_balance_imports"."control_credit_minor"),
	CONSTRAINT "opening_balance_imports_positive" CHECK ("opening_balance_imports"."control_debit_minor" > 0),
	CONSTRAINT "opening_balance_imports_status" CHECK ("opening_balance_imports"."status" in ('draft','approved','posted','rejected'))
);
--> statement-breakpoint
ALTER TABLE "opening_balance_imports" ADD CONSTRAINT "opening_balance_imports_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opening_balance_imports" ADD CONSTRAINT "opening_balance_imports_journal_fk" FOREIGN KEY ("organization_id","journal_id") REFERENCES "public"."journal_entries"("organization_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE FUNCTION sync_opening_balance_import_status() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE opening_balance_imports
  SET status = CASE WHEN NEW.state = 'approved' THEN 'approved'
                    WHEN NEW.state IN ('posted','reversed') THEN 'posted'
                    ELSE status END,
      updated_at = now()
  WHERE organization_id = NEW.organization_id AND journal_id = NEW.id;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER opening_balance_import_status_sync
AFTER UPDATE OF state ON journal_entries
FOR EACH ROW EXECUTE FUNCTION sync_opening_balance_import_status();
