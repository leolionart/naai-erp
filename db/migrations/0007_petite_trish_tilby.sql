CREATE TABLE "accounting_workflow_policies" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"allow_self_approval" boolean DEFAULT false NOT NULL,
	"self_approval_max_minor" bigint,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_policy_self_approval_threshold" CHECK ((not "accounting_workflow_policies"."allow_self_approval" and "accounting_workflow_policies"."self_approval_max_minor" is null) or ("accounting_workflow_policies"."allow_self_approval" and "accounting_workflow_policies"."self_approval_max_minor" is not null and "accounting_workflow_policies"."self_approval_max_minor" >= 0))
);
--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "approved_by" text;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "approval_reason" text;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "self_approved" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "replacement_of_id" text;--> statement-breakpoint
UPDATE "journal_entries"
SET "created_by" = COALESCE("posted_by", 'legacy-migration'),
    "approved_at" = COALESCE("posted_at", "updated_at"),
    "approved_by" = COALESCE("posted_by", 'legacy-migration'),
    "approval_reason" = 'Backfilled by ERP-220 migration'
WHERE "state" IN ('approved', 'posted', 'reversed');--> statement-breakpoint
ALTER TABLE "accounting_workflow_policies" ADD CONSTRAINT "accounting_workflow_policies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_replacement_of_fk" FOREIGN KEY ("organization_id","replacement_of_id") REFERENCES "public"."journal_entries"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_org_replacement_unique" UNIQUE("organization_id","replacement_of_id");--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_approval_metadata" CHECK (("journal_entries"."state" = 'draft' and "journal_entries"."approved_at" is null and "journal_entries"."approved_by" is null and "journal_entries"."approval_reason" is null) or ("journal_entries"."state" in ('approved','posted','reversed') and "journal_entries"."approved_at" is not null and "journal_entries"."approved_by" is not null and "journal_entries"."approval_reason" is not null and btrim("journal_entries"."approval_reason") <> ''));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_posted_journal_mutation() RETURNS trigger AS $$
BEGIN
  IF OLD.state IN ('posted', 'reversed') THEN
    IF TG_OP = 'UPDATE'
      AND OLD.state = 'posted'
      AND NEW.state = 'reversed'
      AND (NEW.organization_id, NEW.id, NEW.journal_date, NEW.description, NEW.currency,
           NEW.posted_at, NEW.posted_by, NEW.created_by, NEW.approved_at, NEW.approved_by,
           NEW.approval_reason, NEW.self_approved, NEW.reversal_of_id, NEW.replacement_of_id,
           NEW.created_at)
          IS NOT DISTINCT FROM
          (OLD.organization_id, OLD.id, OLD.journal_date, OLD.description, OLD.currency,
           OLD.posted_at, OLD.posted_by, OLD.created_by, OLD.approved_at, OLD.approved_by,
           OLD.approval_reason, OLD.self_approved, OLD.reversal_of_id, OLD.replacement_of_id,
           OLD.created_at)
      AND EXISTS (
        SELECT 1 FROM journal_entries reversal
        WHERE reversal.organization_id = OLD.organization_id
          AND reversal.reversal_of_id = OLD.id
          AND reversal.state = 'posted'
      )
    THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'posted journals are immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
