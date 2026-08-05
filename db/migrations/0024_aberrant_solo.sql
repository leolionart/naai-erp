CREATE TYPE "public"."overhead_allocation_method" AS ENUM('revenue', 'labor_hours', 'headcount', 'fixed_percentage', 'manual');--> statement-breakpoint
CREATE TYPE "public"."overhead_cost_class" AS ENUM('variable', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."overhead_policy_state" AS ENUM('draft', 'submitted', 'approved', 'rejected', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."overhead_pool_state" AS ENUM('ready', 'allocated', 'reversed');--> statement-breakpoint
CREATE TYPE "public"."overhead_run_state" AS ENUM('draft', 'submitted', 'approved', 'posted', 'reversed', 'rejected');--> statement-breakpoint
CREATE TABLE "overhead_allocation_policies" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"policy_code" text NOT NULL,
	"version_number" integer NOT NULL,
	"name" text NOT NULL,
	"method" "overhead_allocation_method" NOT NULL,
	"cost_class" "overhead_cost_class" NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"state" "overhead_policy_state" DEFAULT 'draft' NOT NULL,
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
	CONSTRAINT "overhead_allocation_policies_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "overhead_policy_code_version_unique" UNIQUE("organization_id","policy_code","version_number"),
	CONSTRAINT "overhead_policy_code" CHECK (btrim("overhead_allocation_policies"."policy_code") <> ''),
	CONSTRAINT "overhead_policy_name" CHECK (btrim("overhead_allocation_policies"."name") <> ''),
	CONSTRAINT "overhead_policy_version_number" CHECK ("overhead_allocation_policies"."version_number" > 0),
	CONSTRAINT "overhead_policy_version" CHECK ("overhead_allocation_policies"."version" > 0),
	CONSTRAINT "overhead_policy_dates" CHECK ("overhead_allocation_policies"."effective_to" is null or "overhead_allocation_policies"."effective_to" >= "overhead_allocation_policies"."effective_from")
);
--> statement-breakpoint
CREATE TABLE "overhead_allocation_runs" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"pool_id" text NOT NULL,
	"policy_id" text NOT NULL,
	"policy_version_number" integer NOT NULL,
	"method" "overhead_allocation_method" NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"currency" text NOT NULL,
	"allocatable_amount_minor" bigint NOT NULL,
	"basis_snapshot" jsonb NOT NULL,
	"policy_snapshot" jsonb NOT NULL,
	"state" "overhead_run_state" DEFAULT 'draft' NOT NULL,
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
	CONSTRAINT "overhead_allocation_runs_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "overhead_run_pool_unique" UNIQUE("organization_id","pool_id"),
	CONSTRAINT "overhead_run_period" CHECK ("overhead_allocation_runs"."period_end" >= "overhead_allocation_runs"."period_start"),
	CONSTRAINT "overhead_run_currency" CHECK ("overhead_allocation_runs"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "overhead_run_amount" CHECK ("overhead_allocation_runs"."allocatable_amount_minor" > 0),
	CONSTRAINT "overhead_run_version" CHECK ("overhead_allocation_runs"."version" > 0),
	CONSTRAINT "overhead_run_reason" CHECK (btrim("overhead_allocation_runs"."reason") <> '')
);
--> statement-breakpoint
CREATE TABLE "overhead_allocation_splits" (
	"organization_id" text NOT NULL,
	"run_id" text NOT NULL,
	"project_id" text NOT NULL,
	"basis_value" bigint NOT NULL,
	"basis_total" bigint NOT NULL,
	"amount_minor" bigint NOT NULL,
	"rounding_rank" integer NOT NULL,
	CONSTRAINT "overhead_allocation_splits_organization_id_run_id_project_id_pk" PRIMARY KEY("organization_id","run_id","project_id"),
	CONSTRAINT "overhead_split_basis" CHECK ("overhead_allocation_splits"."basis_value" >= 0 and "overhead_allocation_splits"."basis_total" > 0),
	CONSTRAINT "overhead_split_amount" CHECK ("overhead_allocation_splits"."amount_minor" >= 0),
	CONSTRAINT "overhead_split_rank" CHECK ("overhead_allocation_splits"."rounding_rank" > 0)
);
--> statement-breakpoint
CREATE TABLE "overhead_source_pool_items" (
	"organization_id" text NOT NULL,
	"pool_id" text NOT NULL,
	"source_cost_item_id" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"base_amount_minor" bigint NOT NULL,
	CONSTRAINT "overhead_source_pool_items_organization_id_pool_id_source_cost_item_id_pk" PRIMARY KEY("organization_id","pool_id","source_cost_item_id"),
	CONSTRAINT "overhead_source_item_exclusive" UNIQUE("organization_id","source_cost_item_id"),
	CONSTRAINT "overhead_pool_item_amount" CHECK ("overhead_source_pool_items"."amount_minor" > 0 and "overhead_source_pool_items"."base_amount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "overhead_source_pools" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"policy_id" text NOT NULL,
	"policy_version_number" integer NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"currency" text NOT NULL,
	"source_amount_minor" bigint NOT NULL,
	"source_base_amount_minor" bigint NOT NULL,
	"state" "overhead_pool_state" DEFAULT 'ready' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"reason" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "overhead_source_pools_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "overhead_pool_period" CHECK ("overhead_source_pools"."period_end" >= "overhead_source_pools"."period_start"),
	CONSTRAINT "overhead_pool_currency" CHECK ("overhead_source_pools"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "overhead_pool_amount" CHECK ("overhead_source_pools"."source_amount_minor" > 0 and "overhead_source_pools"."source_base_amount_minor" > 0),
	CONSTRAINT "overhead_pool_reason" CHECK (btrim("overhead_source_pools"."reason") <> ''),
	CONSTRAINT "overhead_pool_version" CHECK ("overhead_source_pools"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "overhead_allocation_runs" ADD CONSTRAINT "overhead_runs_pool_fk" FOREIGN KEY ("organization_id","pool_id") REFERENCES "public"."overhead_source_pools"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overhead_allocation_runs" ADD CONSTRAINT "overhead_runs_policy_fk" FOREIGN KEY ("organization_id","policy_id") REFERENCES "public"."overhead_allocation_policies"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overhead_allocation_runs" ADD CONSTRAINT "overhead_runs_journal_fk" FOREIGN KEY ("organization_id","journal_id") REFERENCES "public"."journal_entries"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overhead_allocation_runs" ADD CONSTRAINT "overhead_runs_reversal_fk" FOREIGN KEY ("organization_id","reversal_journal_id") REFERENCES "public"."journal_entries"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overhead_allocation_splits" ADD CONSTRAINT "overhead_splits_run_fk" FOREIGN KEY ("organization_id","run_id") REFERENCES "public"."overhead_allocation_runs"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overhead_allocation_splits" ADD CONSTRAINT "overhead_splits_project_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "public"."projects"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overhead_source_pool_items" ADD CONSTRAINT "overhead_pool_items_pool_fk" FOREIGN KEY ("organization_id","pool_id") REFERENCES "public"."overhead_source_pools"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overhead_source_pool_items" ADD CONSTRAINT "overhead_pool_items_cost_fk" FOREIGN KEY ("organization_id","source_cost_item_id") REFERENCES "public"."project_cost_items"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overhead_source_pools" ADD CONSTRAINT "overhead_source_pools_policy_fk" FOREIGN KEY ("organization_id","policy_id") REFERENCES "public"."overhead_allocation_policies"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "overhead_policy_effective_idx" ON "overhead_allocation_policies" USING btree ("organization_id","policy_code","state","effective_from","effective_to");--> statement-breakpoint
CREATE INDEX "overhead_run_period_state_idx" ON "overhead_allocation_runs" USING btree ("organization_id","period_start","period_end","state");--> statement-breakpoint
CREATE INDEX "overhead_pool_period_idx" ON "overhead_source_pools" USING btree ("organization_id","period_start","period_end","state");