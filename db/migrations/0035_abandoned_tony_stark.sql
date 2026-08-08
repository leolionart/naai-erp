CREATE TYPE "public"."expense_funding_treatment" AS ENUM('company_funds', 'owner_paid_company_cost', 'tax_only_non_cash');--> statement-breakpoint
CREATE TABLE "expense_categories" (
	"organization_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"funding_treatment" "expense_funding_treatment" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_by" text DEFAULT 'master-data' NOT NULL,
	"updated_by" text DEFAULT 'master-data' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expense_categories_organization_id_code_pk" PRIMARY KEY("organization_id","code"),
	CONSTRAINT "expense_categories_code_not_blank" CHECK (btrim("expense_categories"."code") <> ''),
	CONSTRAINT "expense_categories_name_not_blank" CHECK (btrim("expense_categories"."name") <> ''),
	CONSTRAINT "expense_categories_version_positive" CHECK ("expense_categories"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "expense_lines" ADD COLUMN "expense_category_code" text;--> statement-breakpoint
ALTER TABLE "expense_lines" ADD COLUMN "funding_treatment" "expense_funding_treatment";--> statement-breakpoint
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_lines" ADD CONSTRAINT "expense_lines_category_fk" FOREIGN KEY ("organization_id","expense_category_code") REFERENCES "public"."expense_categories"("organization_id","code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_lines" ADD CONSTRAINT "expense_lines_category_snapshot" CHECK (("expense_lines"."expense_category_code" is null and "expense_lines"."funding_treatment" is null) or ("expense_lines"."expense_category_code" is not null and "expense_lines"."funding_treatment" is not null));
