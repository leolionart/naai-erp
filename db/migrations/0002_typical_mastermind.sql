CREATE TYPE "public"."dimension_kind" AS ENUM('cost_center', 'service_line', 'category', 'client', 'project', 'contract');--> statement-breakpoint
CREATE TABLE "default_mapping_versions" (
	"organization_id" text NOT NULL,
	"category_code" text NOT NULL,
	"account_code" text NOT NULL,
	"tax_code" text,
	"tax_effective_from" date,
	"default_cost_center_code" text,
	"default_service_line_code" text,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"change_reason" text NOT NULL,
	"correlation_id" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "default_mapping_versions_organization_id_category_code_effective_from_pk" PRIMARY KEY("organization_id","category_code","effective_from"),
	CONSTRAINT "default_mappings_tax_columns_together" CHECK (("default_mapping_versions"."tax_code" is null and "default_mapping_versions"."tax_effective_from" is null) or ("default_mapping_versions"."tax_code" is not null and "default_mapping_versions"."tax_effective_from" is not null)),
	CONSTRAINT "default_mappings_date_order" CHECK ("default_mapping_versions"."effective_to" is null or "default_mapping_versions"."effective_to" > "default_mapping_versions"."effective_from"),
	CONSTRAINT "default_mappings_reason_not_blank" CHECK (btrim("default_mapping_versions"."change_reason") <> '')
);
--> statement-breakpoint
CREATE TABLE "dimension_requirement_versions" (
	"organization_id" text NOT NULL,
	"account_code" text NOT NULL,
	"required_kinds" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"change_reason" text NOT NULL,
	"correlation_id" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dimension_requirement_versions_organization_id_account_code_effective_from_pk" PRIMARY KEY("organization_id","account_code","effective_from"),
	CONSTRAINT "dimension_requirements_date_order" CHECK ("dimension_requirement_versions"."effective_to" is null or "dimension_requirement_versions"."effective_to" > "dimension_requirement_versions"."effective_from"),
	CONSTRAINT "dimension_requirements_reason_not_blank" CHECK (btrim("dimension_requirement_versions"."change_reason") <> '')
);
--> statement-breakpoint
CREATE TABLE "dimension_values" (
	"organization_id" text NOT NULL,
	"kind" "dimension_kind" NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dimension_values_organization_id_kind_code_pk" PRIMARY KEY("organization_id","kind","code"),
	CONSTRAINT "dimension_values_code_not_blank" CHECK (btrim("dimension_values"."code") <> ''),
	CONSTRAINT "dimension_values_name_not_blank" CHECK (btrim("dimension_values"."name") <> '')
);
--> statement-breakpoint
ALTER TABLE "default_mapping_versions" ADD CONSTRAINT "default_mappings_account_fk" FOREIGN KEY ("organization_id","account_code") REFERENCES "public"."accounts"("organization_id","code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "default_mapping_versions" ADD CONSTRAINT "default_mappings_tax_version_fk" FOREIGN KEY ("organization_id","tax_code","tax_effective_from") REFERENCES "public"."tax_code_versions"("organization_id","code","effective_from") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dimension_requirement_versions" ADD CONSTRAINT "dimension_requirements_account_fk" FOREIGN KEY ("organization_id","account_code") REFERENCES "public"."accounts"("organization_id","code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dimension_values" ADD CONSTRAINT "dimension_values_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;