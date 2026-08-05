CREATE TYPE "public"."milestone_acceptance_state" AS ENUM('draft', 'submitted', 'accepted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."project_budget_category" AS ENUM('revenue', 'labor', 'freelancer', 'vendor', 'tool', 'travel', 'overhead');--> statement-breakpoint
CREATE TYPE "public"."project_budget_kind" AS ENUM('baseline', 'revision');--> statement-breakpoint
CREATE TYPE "public"."project_budget_state" AS ENUM('draft', 'submitted', 'approved', 'rejected', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."recognition_event_state" AS ENUM('draft', 'submitted', 'approved', 'posted', 'reversed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."recognition_policy_method" AS ENUM('milestone', 'percentage_of_completion', 'invoice');--> statement-breakpoint
CREATE TYPE "public"."recognition_policy_state" AS ENUM('draft', 'submitted', 'approved', 'rejected', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."scope_change_state" AS ENUM('draft', 'submitted', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "milestone_acceptances" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"milestone_id" text NOT NULL,
	"accepted_amount_minor" bigint NOT NULL,
	"effective_on" date NOT NULL,
	"evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"state" "milestone_acceptance_state" DEFAULT 'draft' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"submitted_by" text,
	"submitted_at" timestamp with time zone,
	"accepted_by" text,
	"accepted_at" timestamp with time zone,
	"rejected_by" text,
	"rejected_at" timestamp with time zone,
	"reason" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "milestone_acceptances_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "milestone_acceptance_amount" CHECK ("milestone_acceptances"."accepted_amount_minor" > 0),
	CONSTRAINT "milestone_acceptance_reason" CHECK (btrim("milestone_acceptances"."reason") <> ''),
	CONSTRAINT "milestone_acceptance_version" CHECK ("milestone_acceptances"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "project_budget_lines" (
	"organization_id" text NOT NULL,
	"budget_version_id" text NOT NULL,
	"id" text NOT NULL,
	"category" "project_budget_category" NOT NULL,
	"amount_minor" bigint NOT NULL,
	"service_line_code" text,
	"milestone_id" text,
	"note" text,
	CONSTRAINT "project_budget_lines_organization_id_budget_version_id_id_pk" PRIMARY KEY("organization_id","budget_version_id","id"),
	CONSTRAINT "project_budget_line_amount" CHECK ("project_budget_lines"."amount_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "project_budget_versions" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"project_id" text NOT NULL,
	"version_number" integer NOT NULL,
	"kind" "project_budget_kind" NOT NULL,
	"previous_version_id" text,
	"scope_change_id" text,
	"currency" text NOT NULL,
	"effective_on" date NOT NULL,
	"state" "project_budget_state" DEFAULT 'draft' NOT NULL,
	"revenue_total_minor" bigint DEFAULT 0 NOT NULL,
	"direct_cost_total_minor" bigint DEFAULT 0 NOT NULL,
	"overhead_total_minor" bigint DEFAULT 0 NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"submitted_by" text,
	"submitted_at" timestamp with time zone,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"rejected_by" text,
	"rejected_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_budget_versions_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "project_budget_version_number_unique" UNIQUE("organization_id","project_id","version_number"),
	CONSTRAINT "project_budget_version_number" CHECK ("project_budget_versions"."version_number" > 0),
	CONSTRAINT "project_budget_version_resource_version" CHECK ("project_budget_versions"."version" > 0),
	CONSTRAINT "project_budget_currency" CHECK ("project_budget_versions"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "project_budget_totals" CHECK ("project_budget_versions"."revenue_total_minor" >= 0 and "project_budget_versions"."direct_cost_total_minor" >= 0 and "project_budget_versions"."overhead_total_minor" >= 0),
	CONSTRAINT "project_budget_revision_links" CHECK (("project_budget_versions"."kind"='baseline' and "project_budget_versions"."previous_version_id" is null and "project_budget_versions"."scope_change_id" is null) or ("project_budget_versions"."kind"='revision' and "project_budget_versions"."previous_version_id" is not null and "project_budget_versions"."scope_change_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "revenue_recognition_events" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"project_id" text NOT NULL,
	"policy_id" text NOT NULL,
	"policy_version_number" integer NOT NULL,
	"milestone_acceptance_id" text,
	"effective_on" date NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"policy_snapshot" jsonb NOT NULL,
	"state" "recognition_event_state" DEFAULT 'draft' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"submitted_by" text,
	"submitted_at" timestamp with time zone,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"rejected_by" text,
	"rejected_at" timestamp with time zone,
	"posted_by" text,
	"posted_at" timestamp with time zone,
	"journal_id" text,
	"reversed_by" text,
	"reversed_at" timestamp with time zone,
	"reversal_journal_id" text,
	"reversal_reason" text,
	"reason" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "revenue_recognition_events_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "recognition_event_amount" CHECK ("revenue_recognition_events"."amount_minor" > 0),
	CONSTRAINT "recognition_event_currency" CHECK ("revenue_recognition_events"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "recognition_event_reason" CHECK (btrim("revenue_recognition_events"."reason") <> ''),
	CONSTRAINT "recognition_event_version" CHECK ("revenue_recognition_events"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "revenue_recognition_policies" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"project_id" text NOT NULL,
	"version_number" integer NOT NULL,
	"method" "recognition_policy_method" NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"currency" text NOT NULL,
	"contract_value_minor" bigint NOT NULL,
	"revenue_account_code" text NOT NULL,
	"contract_asset_account_code" text NOT NULL,
	"contract_liability_account_code" text NOT NULL,
	"evidence_required" boolean DEFAULT true NOT NULL,
	"state" "recognition_policy_state" DEFAULT 'draft' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"submitted_by" text,
	"submitted_at" timestamp with time zone,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"rejected_by" text,
	"rejected_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "revenue_recognition_policies_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "recognition_policy_project_version_unique" UNIQUE("organization_id","project_id","version_number"),
	CONSTRAINT "recognition_policy_version_number" CHECK ("revenue_recognition_policies"."version_number" > 0),
	CONSTRAINT "recognition_policy_version" CHECK ("revenue_recognition_policies"."version" > 0),
	CONSTRAINT "recognition_policy_contract_value" CHECK ("revenue_recognition_policies"."contract_value_minor" >= 0),
	CONSTRAINT "recognition_policy_currency" CHECK ("revenue_recognition_policies"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "recognition_policy_dates" CHECK ("revenue_recognition_policies"."effective_to" is null or "revenue_recognition_policies"."effective_to" >= "revenue_recognition_policies"."effective_from")
);
--> statement-breakpoint
CREATE TABLE "scope_changes" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"project_id" text NOT NULL,
	"reason" text NOT NULL,
	"expected_revenue_impact_minor" bigint NOT NULL,
	"expected_cost_impact_minor" bigint NOT NULL,
	"expected_schedule_impact_days" integer NOT NULL,
	"evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"state" "scope_change_state" DEFAULT 'draft' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"submitted_by" text,
	"submitted_at" timestamp with time zone,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"rejected_by" text,
	"rejected_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scope_changes_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "scope_changes_reason" CHECK (btrim("scope_changes"."reason") <> ''),
	CONSTRAINT "scope_changes_version" CHECK ("scope_changes"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "milestone_acceptances" ADD CONSTRAINT "milestone_acceptances_milestone_fk" FOREIGN KEY ("organization_id","milestone_id") REFERENCES "public"."milestones"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_budget_lines" ADD CONSTRAINT "project_budget_lines_budget_fk" FOREIGN KEY ("organization_id","budget_version_id") REFERENCES "public"."project_budget_versions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_budget_lines" ADD CONSTRAINT "project_budget_lines_milestone_fk" FOREIGN KEY ("organization_id","milestone_id") REFERENCES "public"."milestones"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_budget_versions" ADD CONSTRAINT "project_budget_versions_project_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "public"."projects"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_budget_versions" ADD CONSTRAINT "project_budget_versions_previous_fk" FOREIGN KEY ("organization_id","previous_version_id") REFERENCES "public"."project_budget_versions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_budget_versions" ADD CONSTRAINT "project_budget_versions_scope_fk" FOREIGN KEY ("organization_id","scope_change_id") REFERENCES "public"."scope_changes"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_recognition_events" ADD CONSTRAINT "recognition_events_project_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "public"."projects"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_recognition_events" ADD CONSTRAINT "recognition_events_policy_fk" FOREIGN KEY ("organization_id","policy_id") REFERENCES "public"."revenue_recognition_policies"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_recognition_events" ADD CONSTRAINT "recognition_events_acceptance_fk" FOREIGN KEY ("organization_id","milestone_acceptance_id") REFERENCES "public"."milestone_acceptances"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_recognition_events" ADD CONSTRAINT "recognition_events_journal_fk" FOREIGN KEY ("organization_id","journal_id") REFERENCES "public"."journal_entries"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_recognition_events" ADD CONSTRAINT "recognition_events_reversal_fk" FOREIGN KEY ("organization_id","reversal_journal_id") REFERENCES "public"."journal_entries"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_recognition_policies" ADD CONSTRAINT "recognition_policies_project_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "public"."projects"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scope_changes" ADD CONSTRAINT "scope_changes_project_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "public"."projects"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "milestone_acceptance_state_idx" ON "milestone_acceptances" USING btree ("organization_id","milestone_id","state");--> statement-breakpoint
CREATE INDEX "project_budget_project_state_idx" ON "project_budget_versions" USING btree ("organization_id","project_id","state");--> statement-breakpoint
CREATE INDEX "recognition_events_project_effective_idx" ON "revenue_recognition_events" USING btree ("organization_id","project_id","effective_on","state");--> statement-breakpoint
CREATE INDEX "recognition_policy_effective_idx" ON "revenue_recognition_policies" USING btree ("organization_id","project_id","state","effective_from","effective_to");--> statement-breakpoint
CREATE INDEX "scope_changes_project_state_idx" ON "scope_changes" USING btree ("organization_id","project_id","state");