CREATE TYPE "public"."direct_cost_allocation_state" AS ENUM('draft', 'submitted', 'approved', 'posted', 'reversed');--> statement-breakpoint
CREATE TYPE "public"."project_cost_basis" AS ENUM('ledger', 'management');--> statement-breakpoint
CREATE TYPE "public"."project_cost_class" AS ENUM('direct', 'overhead_reserved');--> statement-breakpoint
CREATE TYPE "public"."project_cost_source_type" AS ENUM('expense', 'commercial_document', 'journal_line', 'timesheet', 'adjustment');--> statement-breakpoint
CREATE TABLE "direct_cost_allocation_splits" (
	"organization_id" text NOT NULL,
	"allocation_id" text NOT NULL,
	"line_number" integer NOT NULL,
	"project_id" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"base_amount_minor" bigint NOT NULL,
	"reason" text NOT NULL,
	CONSTRAINT "direct_cost_allocation_splits_organization_id_allocation_id_line_number_pk" PRIMARY KEY("organization_id","allocation_id","line_number"),
	CONSTRAINT "direct_cost_allocation_splits_line" CHECK ("direct_cost_allocation_splits"."line_number" > 0),
	CONSTRAINT "direct_cost_allocation_splits_amount" CHECK ("direct_cost_allocation_splits"."amount_minor" > 0 and "direct_cost_allocation_splits"."base_amount_minor" > 0),
	CONSTRAINT "direct_cost_allocation_splits_reason" CHECK (btrim("direct_cost_allocation_splits"."reason") <> '')
);
--> statement-breakpoint
CREATE TABLE "direct_cost_allocations" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"source_cost_item_id" text NOT NULL,
	"allocatable_amount_minor" bigint NOT NULL,
	"allocatable_base_amount_minor" bigint NOT NULL,
	"state" "direct_cost_allocation_state" DEFAULT 'draft' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"submitted_by" text,
	"submitted_at" timestamp with time zone,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"posted_by" text,
	"posted_at" timestamp with time zone,
	"journal_id" text,
	"reversed_by" text,
	"reversed_at" timestamp with time zone,
	"reversal_journal_id" text,
	"reversal_reason" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "direct_cost_allocations_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "direct_cost_allocations_amount" CHECK ("direct_cost_allocations"."allocatable_amount_minor" > 0 and "direct_cost_allocations"."allocatable_base_amount_minor" > 0),
	CONSTRAINT "direct_cost_allocations_version" CHECK ("direct_cost_allocations"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "project_cost_items" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"source_type" "project_cost_source_type" NOT NULL,
	"source_id" text NOT NULL,
	"source_line_id" text,
	"project_id" text,
	"cost_class" "project_cost_class" NOT NULL,
	"basis" "project_cost_basis" NOT NULL,
	"effective_on" date NOT NULL,
	"ledger_account_code" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"base_amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"journal_id" text,
	"evidence_id" text,
	"description" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_cost_items_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "project_cost_items_source_unique" UNIQUE("organization_id","source_type","source_id","source_line_id","basis"),
	CONSTRAINT "project_cost_items_amount_positive" CHECK ("project_cost_items"."amount_minor" > 0 and "project_cost_items"."base_amount_minor" > 0),
	CONSTRAINT "project_cost_items_currency" CHECK ("project_cost_items"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "project_cost_items_description" CHECK (btrim("project_cost_items"."description") <> '')
);
--> statement-breakpoint
ALTER TABLE "direct_cost_allocation_splits" ADD CONSTRAINT "direct_cost_allocation_splits_allocation_fk" FOREIGN KEY ("organization_id","allocation_id") REFERENCES "public"."direct_cost_allocations"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_cost_allocation_splits" ADD CONSTRAINT "direct_cost_allocation_splits_project_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "public"."projects"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_cost_allocations" ADD CONSTRAINT "direct_cost_allocations_source_fk" FOREIGN KEY ("organization_id","source_cost_item_id") REFERENCES "public"."project_cost_items"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_cost_items" ADD CONSTRAINT "project_cost_items_project_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "public"."projects"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "direct_cost_allocations_source_state_idx" ON "direct_cost_allocations" USING btree ("organization_id","source_cost_item_id","state");--> statement-breakpoint
CREATE INDEX "project_cost_items_unallocated_idx" ON "project_cost_items" USING btree ("organization_id","project_id","cost_class","basis");