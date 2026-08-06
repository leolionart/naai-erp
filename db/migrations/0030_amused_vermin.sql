CREATE TYPE "public"."executive_metric_policy_state" AS ENUM('draft', 'approved', 'retired');--> statement-breakpoint
CREATE TYPE "public"."executive_metric_semantic_kind" AS ENUM('contributed_capital', 'retained_earnings', 'unrestricted_cash', 'restricted_cash', 'reviewed_equity_adjustment', 'other_equity', 'owner_withdrawal');--> statement-breakpoint
CREATE TYPE "public"."roi_input_kind" AS ENUM('benefit', 'included_cost');--> statement-breakpoint
CREATE TYPE "public"."roi_input_review_state" AS ENUM('pending', 'reviewed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."roi_purpose" AS ENUM('project', 'marketing', 'custom');--> statement-breakpoint
CREATE TABLE "executive_metric_policy_versions" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"version" integer NOT NULL,
	"state" "executive_metric_policy_state" DEFAULT 'draft' NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"formula_version" text NOT NULL,
	"formula_policy" jsonb NOT NULL,
	"change_reason" text NOT NULL,
	"created_by" text NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "executive_metric_policy_versions_organization_id_id_version_pk" PRIMARY KEY("organization_id","id","version"),
	CONSTRAINT "executive_metric_policy_effective_unique" UNIQUE("organization_id","id","effective_from"),
	CONSTRAINT "executive_metric_policy_version_positive" CHECK ("executive_metric_policy_versions"."version" > 0),
	CONSTRAINT "executive_metric_policy_formula_version_not_blank" CHECK (btrim("executive_metric_policy_versions"."formula_version") <> ''),
	CONSTRAINT "executive_metric_policy_reason_not_blank" CHECK (btrim("executive_metric_policy_versions"."change_reason") <> ''),
	CONSTRAINT "executive_metric_policy_date_order" CHECK ("executive_metric_policy_versions"."effective_to" is null or "executive_metric_policy_versions"."effective_to" >= "executive_metric_policy_versions"."effective_from"),
	CONSTRAINT "executive_metric_policy_approval_metadata" CHECK (("executive_metric_policy_versions"."state" = 'draft' and "executive_metric_policy_versions"."approved_by" is null and "executive_metric_policy_versions"."approved_at" is null) or ("executive_metric_policy_versions"."state" in ('approved','retired') and "executive_metric_policy_versions"."approved_by" is not null and "executive_metric_policy_versions"."approved_at" is not null)),
	CONSTRAINT "executive_metric_policy_average_burn_months_positive" CHECK (coalesce(("executive_metric_policy_versions"."formula_policy"->>'averageBurnMonths') ~ '^[1-9][0-9]*$', false))
);
--> statement-breakpoint
CREATE TABLE "executive_metric_semantic_mappings" (
	"organization_id" text NOT NULL,
	"policy_id" text NOT NULL,
	"policy_version" integer NOT NULL,
	"semantic" "executive_metric_semantic_kind" NOT NULL,
	"account_code" text NOT NULL,
	"sign" integer DEFAULT 1 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "executive_metric_semantic_mappings_organization_id_policy_id_policy_version_semantic_account_code_pk" PRIMARY KEY("organization_id","policy_id","policy_version","semantic","account_code"),
	CONSTRAINT "executive_metric_semantic_mapping_account_unique" UNIQUE("organization_id","policy_id","policy_version","account_code"),
	CONSTRAINT "executive_metric_semantic_mapping_sign" CHECK ("executive_metric_semantic_mappings"."sign" in (-1, 1))
);
--> statement-breakpoint
CREATE TABLE "roi_definition_versions" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"version" integer NOT NULL,
	"purpose" "roi_purpose" NOT NULL,
	"name" text NOT NULL,
	"state" "executive_metric_policy_state" DEFAULT 'draft' NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"formula_version" text NOT NULL,
	"included_cost_policy" jsonb NOT NULL,
	"change_reason" text NOT NULL,
	"created_by" text NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roi_definition_versions_organization_id_id_version_pk" PRIMARY KEY("organization_id","id","version"),
	CONSTRAINT "roi_definition_effective_unique" UNIQUE("organization_id","id","effective_from"),
	CONSTRAINT "roi_definition_version_positive" CHECK ("roi_definition_versions"."version" > 0),
	CONSTRAINT "roi_definition_name_not_blank" CHECK (btrim("roi_definition_versions"."name") <> ''),
	CONSTRAINT "roi_definition_formula_version_not_blank" CHECK (btrim("roi_definition_versions"."formula_version") <> ''),
	CONSTRAINT "roi_definition_reason_not_blank" CHECK (btrim("roi_definition_versions"."change_reason") <> ''),
	CONSTRAINT "roi_definition_date_order" CHECK ("roi_definition_versions"."effective_to" is null or "roi_definition_versions"."effective_to" >= "roi_definition_versions"."effective_from"),
	CONSTRAINT "roi_definition_approval_metadata" CHECK (("roi_definition_versions"."state" = 'draft' and "roi_definition_versions"."approved_by" is null and "roi_definition_versions"."approved_at" is null) or ("roi_definition_versions"."state" in ('approved','retired') and "roi_definition_versions"."approved_by" is not null and "roi_definition_versions"."approved_at" is not null)),
	CONSTRAINT "roi_definition_included_cost_policy_objects" CHECK (coalesce(jsonb_typeof("roi_definition_versions"."included_cost_policy") = 'object' and jsonb_typeof("roi_definition_versions"."included_cost_policy"->'includedKinds') = 'array' and jsonb_typeof("roi_definition_versions"."included_cost_policy"->'excludedKinds') = 'array', false))
);
--> statement-breakpoint
CREATE TABLE "roi_input_facts" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"definition_id" text NOT NULL,
	"definition_version" integer NOT NULL,
	"kind" "roi_input_kind" NOT NULL,
	"period_starts_on" date NOT NULL,
	"period_ends_on" date NOT NULL,
	"dimensions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"review_state" "roi_input_review_state" DEFAULT 'pending' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"review_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roi_input_facts_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "roi_input_fact_source_unique" UNIQUE("organization_id","definition_id","definition_version","source_type","source_id","kind"),
	CONSTRAINT "roi_input_fact_period_order" CHECK ("roi_input_facts"."period_ends_on" >= "roi_input_facts"."period_starts_on"),
	CONSTRAINT "roi_input_fact_amount_nonnegative" CHECK ("roi_input_facts"."amount_minor" >= 0),
	CONSTRAINT "roi_input_fact_dimensions_object" CHECK (jsonb_typeof("roi_input_facts"."dimensions") = 'object'),
	CONSTRAINT "roi_input_fact_currency_not_blank" CHECK (btrim("roi_input_facts"."currency") <> ''),
	CONSTRAINT "roi_input_fact_source_type_not_blank" CHECK (btrim("roi_input_facts"."source_type") <> ''),
	CONSTRAINT "roi_input_fact_source_id_not_blank" CHECK (btrim("roi_input_facts"."source_id") <> ''),
	CONSTRAINT "roi_input_fact_review_metadata" CHECK (("roi_input_facts"."review_state" = 'pending' and "roi_input_facts"."reviewed_by" is null and "roi_input_facts"."reviewed_at" is null) or ("roi_input_facts"."review_state" in ('reviewed','rejected') and "roi_input_facts"."reviewed_by" is not null and "roi_input_facts"."reviewed_at" is not null and btrim(coalesce("roi_input_facts"."review_reason", '')) <> ''))
);
--> statement-breakpoint
ALTER TABLE "executive_metric_policy_versions" ADD CONSTRAINT "executive_metric_policy_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "executive_metric_semantic_mappings" ADD CONSTRAINT "executive_metric_semantic_mappings_policy_fk" FOREIGN KEY ("organization_id","policy_id","policy_version") REFERENCES "public"."executive_metric_policy_versions"("organization_id","id","version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "executive_metric_semantic_mappings" ADD CONSTRAINT "executive_metric_semantic_mappings_account_fk" FOREIGN KEY ("organization_id","account_code") REFERENCES "public"."accounts"("organization_id","code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roi_definition_versions" ADD CONSTRAINT "roi_definition_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roi_input_facts" ADD CONSTRAINT "roi_input_facts_definition_fk" FOREIGN KEY ("organization_id","definition_id","definition_version") REFERENCES "public"."roi_definition_versions"("organization_id","id","version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "roi_input_facts_period_idx" ON "roi_input_facts" USING btree ("organization_id","definition_id","period_starts_on","period_ends_on");