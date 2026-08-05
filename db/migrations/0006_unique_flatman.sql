CREATE TYPE "public"."posting_rule_status" AS ENUM('draft', 'active', 'retired');--> statement-breakpoint
CREATE TABLE "posting_rule_versions" (
	"organization_id" text NOT NULL,
	"rule_id" text NOT NULL,
	"version" integer NOT NULL,
	"name" text NOT NULL,
	"document_type" text NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"status" "posting_rule_status" DEFAULT 'draft' NOT NULL,
	"conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"line_templates" jsonb NOT NULL,
	"change_reason" text NOT NULL,
	"correlation_id" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "posting_rule_versions_organization_id_rule_id_version_pk" PRIMARY KEY("organization_id","rule_id","version"),
	CONSTRAINT "posting_rule_versions_effective_unique" UNIQUE("organization_id","rule_id","effective_from"),
	CONSTRAINT "posting_rule_version_positive" CHECK ("posting_rule_versions"."version" > 0),
	CONSTRAINT "posting_rule_priority_nonnegative" CHECK ("posting_rule_versions"."priority" >= 0),
	CONSTRAINT "posting_rule_name_not_blank" CHECK (btrim("posting_rule_versions"."name") <> ''),
	CONSTRAINT "posting_rule_document_type_not_blank" CHECK (btrim("posting_rule_versions"."document_type") <> ''),
	CONSTRAINT "posting_rule_change_reason_not_blank" CHECK (btrim("posting_rule_versions"."change_reason") <> ''),
	CONSTRAINT "posting_rule_effective_date_order" CHECK ("posting_rule_versions"."effective_to" is null or "posting_rule_versions"."effective_to" >= "posting_rule_versions"."effective_from"),
	CONSTRAINT "posting_rule_has_line_templates" CHECK (jsonb_array_length("posting_rule_versions"."line_templates") >= 2)
);
--> statement-breakpoint
ALTER TABLE "posting_rule_versions" ADD CONSTRAINT "posting_rule_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;