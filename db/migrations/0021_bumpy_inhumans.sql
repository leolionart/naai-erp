CREATE TYPE "public"."labor_cost_basis" AS ENUM('gross_salary', 'fully_loaded', 'blended');--> statement-breakpoint
CREATE TYPE "public"."labor_cost_rate_state" AS ENUM('draft', 'approved', 'retired');--> statement-breakpoint
CREATE TYPE "public"."time_entry_mode" AS ENUM('timed', 'allocation');--> statement-breakpoint
CREATE TYPE "public"."time_entry_scope" AS ENUM('project', 'internal');--> statement-breakpoint
CREATE TYPE "public"."timesheet_adjustment_state" AS ENUM('draft', 'submitted', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."timesheet_state" AS ENUM('draft', 'submitted', 'approved', 'locked', 'billed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."workforce_kind" AS ENUM('employee', 'freelancer', 'contractor');--> statement-breakpoint
CREATE TABLE "labor_cost_rates" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"worker_id" text NOT NULL,
	"basis" "labor_cost_basis" NOT NULL,
	"hourly_rate_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"state" "labor_cost_rate_state" DEFAULT 'draft' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"approval_reason" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "labor_cost_rates_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "labor_cost_rates_worker_effective_unique" UNIQUE("organization_id","worker_id","effective_from"),
	CONSTRAINT "labor_cost_rates_nonnegative" CHECK ("labor_cost_rates"."hourly_rate_minor" >= 0),
	CONSTRAINT "labor_cost_rates_currency" CHECK ("labor_cost_rates"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "labor_cost_rates_dates" CHECK ("labor_cost_rates"."effective_to" is null or "labor_cost_rates"."effective_to" >= "labor_cost_rates"."effective_from"),
	CONSTRAINT "labor_cost_rates_version" CHECK ("labor_cost_rates"."version" > 0),
	CONSTRAINT "labor_cost_rates_approval" CHECK ("labor_cost_rates"."state" <> 'approved' or ("labor_cost_rates"."approved_by" is not null and "labor_cost_rates"."approved_at" is not null and "labor_cost_rates"."approval_reason" is not null and btrim("labor_cost_rates"."approval_reason") <> ''))
);
--> statement-breakpoint
CREATE TABLE "timesheet_adjustments" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"timesheet_id" text NOT NULL,
	"entry_id" text NOT NULL,
	"work_date" date NOT NULL,
	"minute_delta" integer NOT NULL,
	"cost_delta_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"reason" text NOT NULL,
	"state" timesheet_adjustment_state DEFAULT 'draft' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"requested_by" text NOT NULL,
	"submitted_by" text,
	"submitted_at" timestamp with time zone,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"approval_reason" text,
	"rejected_by" text,
	"rejected_at" timestamp with time zone,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "timesheet_adjustments_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "timesheet_adjustments_nonzero" CHECK ("timesheet_adjustments"."minute_delta" <> 0 or "timesheet_adjustments"."cost_delta_minor" <> 0),
	CONSTRAINT "timesheet_adjustments_currency" CHECK ("timesheet_adjustments"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "timesheet_adjustments_reason" CHECK (btrim("timesheet_adjustments"."reason") <> ''),
	CONSTRAINT "timesheet_adjustments_version" CHECK ("timesheet_adjustments"."version" > 0),
	CONSTRAINT "timesheet_adjustments_approval" CHECK ("timesheet_adjustments"."state" <> 'approved' or ("timesheet_adjustments"."approved_by" is not null and "timesheet_adjustments"."approved_at" is not null and "timesheet_adjustments"."approval_reason" is not null and btrim("timesheet_adjustments"."approval_reason") <> '')),
	CONSTRAINT "timesheet_adjustments_rejection" CHECK ("timesheet_adjustments"."state" <> 'rejected' or ("timesheet_adjustments"."rejected_by" is not null and "timesheet_adjustments"."rejected_at" is not null and "timesheet_adjustments"."rejection_reason" is not null and btrim("timesheet_adjustments"."rejection_reason") <> ''))
);
--> statement-breakpoint
CREATE TABLE "timesheet_cost_snapshots" (
	"organization_id" text NOT NULL,
	"entry_id" text NOT NULL,
	"rate_id" text NOT NULL,
	"applied_hourly_rate_minor" bigint NOT NULL,
	"applied_cost_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_by" text NOT NULL,
	CONSTRAINT "timesheet_cost_snapshots_organization_id_entry_id_pk" PRIMARY KEY("organization_id","entry_id"),
	CONSTRAINT "timesheet_cost_snapshots_rate" CHECK ("timesheet_cost_snapshots"."applied_hourly_rate_minor" >= 0),
	CONSTRAINT "timesheet_cost_snapshots_cost" CHECK ("timesheet_cost_snapshots"."applied_cost_minor" >= 0),
	CONSTRAINT "timesheet_cost_snapshots_currency" CHECK ("timesheet_cost_snapshots"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "timesheet_entries" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"timesheet_id" text NOT NULL,
	"work_date" date NOT NULL,
	"mode" time_entry_mode NOT NULL,
	"scope" time_entry_scope NOT NULL,
	"project_id" text,
	"contract_id" text,
	"service_line_code" text,
	"cost_center_code" text,
	"activity_code" text,
	"minutes" integer NOT NULL,
	"billable" boolean DEFAULT false NOT NULL,
	"description" text NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"allocation_percent" integer,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "timesheet_entries_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "timesheet_entries_minutes" CHECK ("timesheet_entries"."minutes" > 0 and "timesheet_entries"."minutes" <= 10080),
	CONSTRAINT "timesheet_entries_description" CHECK (btrim("timesheet_entries"."description") <> ''),
	CONSTRAINT "timesheet_entries_scope_project" CHECK (("timesheet_entries"."scope" = 'project' and "timesheet_entries"."project_id" is not null) or ("timesheet_entries"."scope" = 'internal' and "timesheet_entries"."project_id" is null and "timesheet_entries"."billable" = false)),
	CONSTRAINT "timesheet_entries_mode_fields" CHECK (("timesheet_entries"."mode" = 'timed' and "timesheet_entries"."started_at" is not null and "timesheet_entries"."ended_at" is not null and "timesheet_entries"."ended_at" > "timesheet_entries"."started_at" and "timesheet_entries"."allocation_percent" is null) or ("timesheet_entries"."mode" = 'allocation' and "timesheet_entries"."started_at" is null and "timesheet_entries"."ended_at" is null and "timesheet_entries"."allocation_percent" between 1 and 100))
);
--> statement-breakpoint
CREATE TABLE "timesheets" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"worker_id" text NOT NULL,
	"week_starts_on" date NOT NULL,
	"state" timesheet_state DEFAULT 'draft' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"submitted_by" text,
	"submitted_at" timestamp with time zone,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"locked_by" text,
	"locked_at" timestamp with time zone,
	"billed_by" text,
	"billed_at" timestamp with time zone,
	"billing_reference" text,
	"rejected_by" text,
	"rejected_at" timestamp with time zone,
	"rejection_reason" text,
	"revised_by" text,
	"revised_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "timesheets_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "timesheets_worker_week_unique" UNIQUE("organization_id","worker_id","week_starts_on"),
	CONSTRAINT "timesheets_week_monday" CHECK (extract(isodow from "timesheets"."week_starts_on") = 1),
	CONSTRAINT "timesheets_version" CHECK ("timesheets"."version" > 0),
	CONSTRAINT "timesheets_rejection_metadata" CHECK ("timesheets"."state" <> 'rejected' or ("timesheets"."rejected_by" is not null and "timesheets"."rejected_at" is not null and "timesheets"."rejection_reason" is not null and btrim("timesheets"."rejection_reason") <> ''))
);
--> statement-breakpoint
CREATE TABLE "workforce_capacity_versions" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"worker_id" text NOT NULL,
	"weekly_minutes" integer NOT NULL,
	"workdays" jsonb NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"version" bigint DEFAULT 1 NOT NULL,
	"reason" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workforce_capacity_versions_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "workforce_capacity_worker_effective_unique" UNIQUE("organization_id","worker_id","effective_from"),
	CONSTRAINT "workforce_capacity_minutes" CHECK ("workforce_capacity_versions"."weekly_minutes" between 0 and 10080),
	CONSTRAINT "workforce_capacity_dates" CHECK ("workforce_capacity_versions"."effective_to" is null or "workforce_capacity_versions"."effective_to" >= "workforce_capacity_versions"."effective_from"),
	CONSTRAINT "workforce_capacity_version" CHECK ("workforce_capacity_versions"."version" > 0),
	CONSTRAINT "workforce_capacity_reason" CHECK (btrim("workforce_capacity_versions"."reason") <> '')
);
--> statement-breakpoint
CREATE TABLE "workforce_profiles" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"party_id" text NOT NULL,
	"user_id" text,
	"kind" "workforce_kind" NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"active" boolean DEFAULT true NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workforce_profiles_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "workforce_profiles_party_unique" UNIQUE("organization_id","party_id"),
	CONSTRAINT "workforce_profiles_version" CHECK ("workforce_profiles"."version" > 0),
	CONSTRAINT "workforce_profiles_dates" CHECK ("workforce_profiles"."ends_on" is null or "workforce_profiles"."ends_on" >= "workforce_profiles"."starts_on")
);
--> statement-breakpoint
ALTER TABLE "labor_cost_rates" ADD CONSTRAINT "labor_cost_rates_worker_fk" FOREIGN KEY ("organization_id","worker_id") REFERENCES "public"."workforce_profiles"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_adjustments" ADD CONSTRAINT "timesheet_adjustments_timesheet_fk" FOREIGN KEY ("organization_id","timesheet_id") REFERENCES "public"."timesheets"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_adjustments" ADD CONSTRAINT "timesheet_adjustments_entry_fk" FOREIGN KEY ("organization_id","entry_id") REFERENCES "public"."timesheet_entries"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_cost_snapshots" ADD CONSTRAINT "timesheet_cost_snapshots_entry_fk" FOREIGN KEY ("organization_id","entry_id") REFERENCES "public"."timesheet_entries"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_cost_snapshots" ADD CONSTRAINT "timesheet_cost_snapshots_rate_fk" FOREIGN KEY ("organization_id","rate_id") REFERENCES "public"."labor_cost_rates"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_timesheet_fk" FOREIGN KEY ("organization_id","timesheet_id") REFERENCES "public"."timesheets"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_project_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "public"."projects"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_worker_fk" FOREIGN KEY ("organization_id","worker_id") REFERENCES "public"."workforce_profiles"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workforce_capacity_versions" ADD CONSTRAINT "workforce_capacity_worker_fk" FOREIGN KEY ("organization_id","worker_id") REFERENCES "public"."workforce_profiles"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workforce_profiles" ADD CONSTRAINT "workforce_profiles_party_fk" FOREIGN KEY ("organization_id","party_id") REFERENCES "public"."parties"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workforce_profiles" ADD CONSTRAINT "workforce_profiles_membership_fk" FOREIGN KEY ("organization_id","user_id") REFERENCES "public"."organization_memberships"("organization_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "labor_cost_rates_worker_dates_idx" ON "labor_cost_rates" USING btree ("organization_id","worker_id","effective_from","effective_to");--> statement-breakpoint
CREATE INDEX "timesheet_entries_timesheet_date_idx" ON "timesheet_entries" USING btree ("organization_id","timesheet_id","work_date");--> statement-breakpoint
CREATE INDEX "timesheets_state_week_idx" ON "timesheets" USING btree ("organization_id","state","week_starts_on");--> statement-breakpoint
CREATE INDEX "workforce_capacity_worker_dates_idx" ON "workforce_capacity_versions" USING btree ("organization_id","worker_id","effective_from","effective_to");--> statement-breakpoint
CREATE UNIQUE INDEX "workforce_profiles_user_unique" ON "workforce_profiles" USING btree ("organization_id","user_id") WHERE "workforce_profiles"."user_id" is not null;