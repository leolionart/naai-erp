CREATE TABLE "planning_actual_facts" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"actual_basis" "planning_actual_basis" NOT NULL,
	"effective_on" date NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"source_parent_id" text,
	"source_version" text NOT NULL,
	"dimensions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"refreshed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "planning_actual_facts_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "planning_actual_fact_source_unique" UNIQUE("organization_id","actual_basis","source_type","source_id"),
	CONSTRAINT "planning_actual_fact_id" CHECK (btrim("planning_actual_facts"."id") <> ''),
	CONSTRAINT "planning_actual_fact_currency" CHECK ("planning_actual_facts"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "planning_actual_fact_source" CHECK (btrim("planning_actual_facts"."source_type") <> '' and btrim("planning_actual_facts"."source_id") <> '' and btrim("planning_actual_facts"."source_version") <> '' and ("planning_actual_facts"."source_parent_id" is null or btrim("planning_actual_facts"."source_parent_id") <> ''))
);
--> statement-breakpoint
ALTER TABLE "planning_actual_facts" ADD CONSTRAINT "planning_actual_facts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "planning_actual_fact_period_idx" ON "planning_actual_facts" USING btree ("organization_id","actual_basis","effective_on","currency");