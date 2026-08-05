CREATE TYPE "public"."eligibility_state" AS ENUM('unreviewed', 'eligible', 'partially_eligible', 'ineligible', 'accountant_override');--> statement-breakpoint
CREATE TYPE "public"."expense_class" AS ENUM('invoice_backed', 'receipt_backed', 'contract_backed', 'payroll_personnel', 'bank_fee', 'tax_payment', 'non_documented', 'owner_personal', 'prepaid_asset', 'fixed_asset', 'employee_reimbursement', 'freelancer', 'platform_fee', 'overseas_vendor', 'petty_cash');--> statement-breakpoint
CREATE TYPE "public"."expense_state" AS ENUM('draft', 'submitted', 'evidence_pending', 'approved', 'rejected', 'posted');--> statement-breakpoint
CREATE TYPE "public"."management_validity_state" AS ENUM('unreviewed', 'valid', 'invalid', 'accountant_override');--> statement-breakpoint
CREATE TABLE "expense_allocations" (
	"organization_id" text NOT NULL,
	"expense_id" text NOT NULL,
	"line_number" integer NOT NULL,
	"allocation_number" integer NOT NULL,
	"amount_minor" bigint NOT NULL,
	"dimensions" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expense_allocations_organization_id_expense_id_line_number_allocation_number_pk" PRIMARY KEY("organization_id","expense_id","line_number","allocation_number"),
	CONSTRAINT "expense_allocations_number" CHECK ("expense_allocations"."allocation_number" > 0),
	CONSTRAINT "expense_allocations_amount" CHECK ("expense_allocations"."amount_minor" > 0),
	CONSTRAINT "expense_allocations_dimensions" CHECK ("expense_allocations"."dimensions" <> '{}'::jsonb)
);
--> statement-breakpoint
CREATE TABLE "expense_events" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"expense_id" text NOT NULL,
	"action" text NOT NULL,
	"from_state" "expense_state",
	"to_state" "expense_state",
	"actor_id" text NOT NULL,
	"reason" text NOT NULL,
	"correlation_id" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expense_events_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "expense_events_reason" CHECK (btrim("expense_events"."reason") <> '')
);
--> statement-breakpoint
CREATE TABLE "expense_lines" (
	"organization_id" text NOT NULL,
	"expense_id" text NOT NULL,
	"line_number" integer NOT NULL,
	"description" text NOT NULL,
	"net_minor" bigint NOT NULL,
	"vat_minor" bigint NOT NULL,
	"gross_minor" bigint NOT NULL,
	"posting_account_code" text NOT NULL,
	"vat_account_code" text,
	"management_state" "management_validity_state" DEFAULT 'unreviewed' NOT NULL,
	"cit_state" "eligibility_state" DEFAULT 'unreviewed' NOT NULL,
	"vat_state" "eligibility_state" DEFAULT 'unreviewed' NOT NULL,
	"cit_eligible_minor" bigint DEFAULT 0 NOT NULL,
	"vat_eligible_minor" bigint DEFAULT 0 NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"review_reason" text,
	"review_reference" text,
	"dimensions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expense_lines_organization_id_expense_id_line_number_pk" PRIMARY KEY("organization_id","expense_id","line_number"),
	CONSTRAINT "expense_lines_number" CHECK ("expense_lines"."line_number" > 0),
	CONSTRAINT "expense_lines_description" CHECK (btrim("expense_lines"."description") <> ''),
	CONSTRAINT "expense_lines_totals" CHECK ("expense_lines"."net_minor" > 0 and "expense_lines"."vat_minor" >= 0 and "expense_lines"."gross_minor" = "expense_lines"."net_minor" + "expense_lines"."vat_minor"),
	CONSTRAINT "expense_lines_vat_account" CHECK (("expense_lines"."vat_minor" = 0 and "expense_lines"."vat_account_code" is null) or ("expense_lines"."vat_minor" > 0 and "expense_lines"."vat_account_code" is not null)),
	CONSTRAINT "expense_lines_eligible_limits" CHECK ("expense_lines"."cit_eligible_minor" >= 0 and "expense_lines"."cit_eligible_minor" <= "expense_lines"."gross_minor" and "expense_lines"."vat_eligible_minor" >= 0 and "expense_lines"."vat_eligible_minor" <= "expense_lines"."vat_minor"),
	CONSTRAINT "expense_lines_review_metadata" CHECK (("expense_lines"."reviewed_by" is null and "expense_lines"."reviewed_at" is null and "expense_lines"."review_reason" is null and "expense_lines"."review_reference" is null) or ("expense_lines"."reviewed_by" is not null and "expense_lines"."reviewed_at" is not null and "expense_lines"."review_reason" is not null and btrim("expense_lines"."review_reason") <> ''))
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"expense_class" "expense_class" NOT NULL,
	"state" "expense_state" DEFAULT 'draft' NOT NULL,
	"payee_party_id" text,
	"employee_party_id" text,
	"expense_date" date NOT NULL,
	"service_period_start" date,
	"service_period_end" date,
	"business_purpose" text NOT NULL,
	"currency" text NOT NULL,
	"net_minor" bigint NOT NULL,
	"vat_minor" bigint NOT NULL,
	"gross_minor" bigint NOT NULL,
	"counter_account_code" text NOT NULL,
	"cit_state" "eligibility_state" DEFAULT 'unreviewed' NOT NULL,
	"vat_state" "eligibility_state" DEFAULT 'unreviewed' NOT NULL,
	"evidence_checklist" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"journal_id" text,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"posted_by" text,
	"posted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "expenses_purpose_not_blank" CHECK (btrim("expenses"."business_purpose") <> ''),
	CONSTRAINT "expenses_currency_iso3" CHECK ("expenses"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "expenses_totals" CHECK ("expenses"."net_minor" > 0 and "expenses"."vat_minor" >= 0 and "expenses"."gross_minor" = "expenses"."net_minor" + "expenses"."vat_minor"),
	CONSTRAINT "expenses_service_period" CHECK (("expenses"."service_period_start" is null and "expenses"."service_period_end" is null) or ("expenses"."service_period_start" is not null and "expenses"."service_period_end" is not null and "expenses"."service_period_start" <= "expenses"."service_period_end")),
	CONSTRAINT "expenses_reimbursement_employee" CHECK ("expenses"."expense_class" <> 'employee_reimbursement' or "expenses"."employee_party_id" is not null),
	CONSTRAINT "expenses_noninvoice_vat" CHECK ("expenses"."expense_class" <> 'non_documented' or ("expenses"."vat_minor" = 0 and "expenses"."vat_state" in ('unreviewed','ineligible','accountant_override'))),
	CONSTRAINT "expenses_version_positive" CHECK ("expenses"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "expense_allocations" ADD CONSTRAINT "expense_allocations_line_fk" FOREIGN KEY ("organization_id","expense_id","line_number") REFERENCES "public"."expense_lines"("organization_id","expense_id","line_number") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_events" ADD CONSTRAINT "expense_events_expense_fk" FOREIGN KEY ("organization_id","expense_id") REFERENCES "public"."expenses"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_lines" ADD CONSTRAINT "expense_lines_expense_fk" FOREIGN KEY ("organization_id","expense_id") REFERENCES "public"."expenses"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_lines" ADD CONSTRAINT "expense_lines_posting_account_fk" FOREIGN KEY ("organization_id","posting_account_code") REFERENCES "public"."accounts"("organization_id","code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_lines" ADD CONSTRAINT "expense_lines_vat_account_fk" FOREIGN KEY ("organization_id","vat_account_code") REFERENCES "public"."accounts"("organization_id","code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_payee_fk" FOREIGN KEY ("organization_id","payee_party_id") REFERENCES "public"."parties"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_employee_fk" FOREIGN KEY ("organization_id","employee_party_id") REFERENCES "public"."parties"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_counter_account_fk" FOREIGN KEY ("organization_id","counter_account_code") REFERENCES "public"."accounts"("organization_id","code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_journal_fk" FOREIGN KEY ("organization_id","journal_id") REFERENCES "public"."journal_entries"("organization_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE FUNCTION prevent_final_expense_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state = 'posted' AND (
    NEW.expense_class IS DISTINCT FROM OLD.expense_class OR
    NEW.payee_party_id IS DISTINCT FROM OLD.payee_party_id OR
    NEW.employee_party_id IS DISTINCT FROM OLD.employee_party_id OR
    NEW.expense_date IS DISTINCT FROM OLD.expense_date OR
    NEW.service_period_start IS DISTINCT FROM OLD.service_period_start OR
    NEW.service_period_end IS DISTINCT FROM OLD.service_period_end OR
    NEW.business_purpose IS DISTINCT FROM OLD.business_purpose OR
    NEW.currency IS DISTINCT FROM OLD.currency OR
    NEW.net_minor IS DISTINCT FROM OLD.net_minor OR
    NEW.vat_minor IS DISTINCT FROM OLD.vat_minor OR
    NEW.gross_minor IS DISTINCT FROM OLD.gross_minor OR
    NEW.counter_account_code IS DISTINCT FROM OLD.counter_account_code OR
    NEW.cit_state IS DISTINCT FROM OLD.cit_state OR
    NEW.vat_state IS DISTINCT FROM OLD.vat_state OR
    NEW.evidence_checklist IS DISTINCT FROM OLD.evidence_checklist OR
    NEW.journal_id IS DISTINCT FROM OLD.journal_id
  ) THEN
    RAISE EXCEPTION 'FINAL_EXPENSE_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER expenses_final_immutable
BEFORE UPDATE ON expenses
FOR EACH ROW EXECUTE FUNCTION prevent_final_expense_mutation();
--> statement-breakpoint
CREATE FUNCTION prevent_final_expense_child_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_state expense_state;
BEGIN
  SELECT state INTO parent_state FROM expenses
  WHERE organization_id=COALESCE(OLD.organization_id,NEW.organization_id)
    AND id=COALESCE(OLD.expense_id,NEW.expense_id);
  IF parent_state = 'posted' THEN
    RAISE EXCEPTION 'FINAL_EXPENSE_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  RETURN COALESCE(NEW,OLD);
END $$;
--> statement-breakpoint
CREATE TRIGGER expense_lines_final_immutable
BEFORE UPDATE OR DELETE ON expense_lines
FOR EACH ROW EXECUTE FUNCTION prevent_final_expense_child_mutation();
--> statement-breakpoint
CREATE TRIGGER expense_allocations_final_immutable
BEFORE UPDATE OR DELETE ON expense_allocations
FOR EACH ROW EXECUTE FUNCTION prevent_final_expense_child_mutation();
