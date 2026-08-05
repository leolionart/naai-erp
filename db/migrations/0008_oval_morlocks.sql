CREATE TABLE "fiscal_period_events" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"fiscal_year" integer NOT NULL,
	"period_number" integer NOT NULL,
	"action" text NOT NULL,
	"from_state" "fiscal_period_state" NOT NULL,
	"to_state" "fiscal_period_state" NOT NULL,
	"actor_id" text NOT NULL,
	"reason" text NOT NULL,
	"correlation_id" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fiscal_period_events_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "fiscal_period_event_action" CHECK ("fiscal_period_events"."action" in ('close','reopen')),
	CONSTRAINT "fiscal_period_event_reason_not_blank" CHECK (btrim("fiscal_period_events"."reason") <> ''),
	CONSTRAINT "fiscal_period_event_state_changes" CHECK ("fiscal_period_events"."from_state" <> "fiscal_period_events"."to_state")
);
--> statement-breakpoint
ALTER TABLE "accounting_workflow_policies" ADD COLUMN "soft_lock_posting_roles" jsonb DEFAULT '["owner","finance_admin"]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "fiscal_period_events" ADD CONSTRAINT "fiscal_period_events_period_fk" FOREIGN KEY ("organization_id","fiscal_year","period_number") REFERENCES "public"."fiscal_periods"("organization_id","fiscal_year","period_number") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE FUNCTION reject_overlapping_fiscal_periods() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM fiscal_periods existing
    WHERE existing.organization_id = NEW.organization_id
      AND (existing.fiscal_year, existing.period_number) <> (NEW.fiscal_year, NEW.period_number)
      AND daterange(existing.starts_on, existing.ends_on, '[]') && daterange(NEW.starts_on, NEW.ends_on, '[]')
  ) THEN
    RAISE EXCEPTION 'fiscal periods cannot overlap within an organization' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER fiscal_periods_no_overlap
BEFORE INSERT OR UPDATE OF organization_id,starts_on,ends_on ON fiscal_periods
FOR EACH ROW EXECUTE FUNCTION reject_overlapping_fiscal_periods();
--> statement-breakpoint
CREATE FUNCTION enforce_fiscal_period_mutation_path() RETURNS trigger AS $$
BEGIN
  IF NEW.state IS DISTINCT FROM OLD.state
     AND COALESCE(current_setting('naai.period_transition_authorized', true), '') <> 'on'
  THEN
    RAISE EXCEPTION 'fiscal period state requires the audited workflow' USING ERRCODE = '42501';
  END IF;
  IF OLD.state <> 'open'
     AND (NEW.starts_on IS DISTINCT FROM OLD.starts_on OR NEW.ends_on IS DISTINCT FROM OLD.ends_on)
  THEN
    RAISE EXCEPTION 'locked fiscal period boundaries are immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER fiscal_periods_controlled_mutation
BEFORE UPDATE OF state,starts_on,ends_on ON fiscal_periods
FOR EACH ROW EXECUTE FUNCTION enforce_fiscal_period_mutation_path();
