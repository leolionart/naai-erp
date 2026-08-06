CREATE TYPE "public"."cash_flow_class" AS ENUM('operating', 'investing', 'financing', 'non_cash');--> statement-breakpoint
CREATE TYPE "public"."financial_statement_kind" AS ENUM('profit_and_loss', 'balance_sheet', 'cash_flow', 'vat_reconciliation');--> statement-breakpoint
CREATE TYPE "public"."financial_statement_mapping_state" AS ENUM('draft', 'approved', 'retired');--> statement-breakpoint
CREATE TABLE "financial_statement_mapping_lines" (
	"organization_id" text NOT NULL,
	"mapping_id" text NOT NULL,
	"mapping_version" integer NOT NULL,
	"line_number" integer NOT NULL,
	"statement" "financial_statement_kind" NOT NULL,
	"line_code" text NOT NULL,
	"label" text NOT NULL,
	"account_code" text NOT NULL,
	"display_order" integer NOT NULL,
	"sign" integer DEFAULT 1 NOT NULL,
	"cash_flow_class" "cash_flow_class",
	"vat_treatment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_statement_mapping_lines_organization_id_mapping_id_mapping_version_line_number_pk" PRIMARY KEY("organization_id","mapping_id","mapping_version","line_number"),
	CONSTRAINT "financial_statement_mapping_account_unique" UNIQUE("organization_id","mapping_id","mapping_version","statement","account_code"),
	CONSTRAINT "financial_statement_mapping_line_number_positive" CHECK ("financial_statement_mapping_lines"."line_number" > 0),
	CONSTRAINT "financial_statement_mapping_display_order_nonnegative" CHECK ("financial_statement_mapping_lines"."display_order" >= 0),
	CONSTRAINT "financial_statement_mapping_sign" CHECK ("financial_statement_mapping_lines"."sign" in (-1, 1)),
	CONSTRAINT "financial_statement_mapping_line_code_not_blank" CHECK (btrim("financial_statement_mapping_lines"."line_code") <> ''),
	CONSTRAINT "financial_statement_mapping_label_not_blank" CHECK (btrim("financial_statement_mapping_lines"."label") <> ''),
	CONSTRAINT "financial_statement_mapping_cash_flow_class" CHECK ("financial_statement_mapping_lines"."statement" = 'cash_flow' or "financial_statement_mapping_lines"."cash_flow_class" is null),
	CONSTRAINT "financial_statement_mapping_vat_treatment" CHECK ("financial_statement_mapping_lines"."vat_treatment" is null or "financial_statement_mapping_lines"."vat_treatment" in ('output','input_eligible','input_ineligible'))
);
--> statement-breakpoint
CREATE TABLE "financial_statement_mapping_versions" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"version" integer NOT NULL,
	"framework" "statutory_framework" NOT NULL,
	"state" "financial_statement_mapping_state" DEFAULT 'draft' NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"change_reason" text NOT NULL,
	"created_by" text NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_statement_mapping_versions_organization_id_id_version_pk" PRIMARY KEY("organization_id","id","version"),
	CONSTRAINT "financial_statement_mapping_version_positive" CHECK ("financial_statement_mapping_versions"."version" > 0),
	CONSTRAINT "financial_statement_mapping_reason_not_blank" CHECK (btrim("financial_statement_mapping_versions"."change_reason") <> ''),
	CONSTRAINT "financial_statement_mapping_date_order" CHECK ("financial_statement_mapping_versions"."effective_to" is null or "financial_statement_mapping_versions"."effective_to" >= "financial_statement_mapping_versions"."effective_from"),
	CONSTRAINT "financial_statement_mapping_approval_metadata" CHECK (("financial_statement_mapping_versions"."state" = 'draft' and "financial_statement_mapping_versions"."approved_by" is null and "financial_statement_mapping_versions"."approved_at" is null) or ("financial_statement_mapping_versions"."state" in ('approved','retired') and "financial_statement_mapping_versions"."approved_by" is not null and "financial_statement_mapping_versions"."approved_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "financial_statement_mapping_lines" ADD CONSTRAINT "financial_statement_mapping_lines_version_fk" FOREIGN KEY ("organization_id","mapping_id","mapping_version") REFERENCES "public"."financial_statement_mapping_versions"("organization_id","id","version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_statement_mapping_lines" ADD CONSTRAINT "financial_statement_mapping_lines_account_fk" FOREIGN KEY ("organization_id","account_code") REFERENCES "public"."accounts"("organization_id","code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_statement_mapping_versions" ADD CONSTRAINT "financial_statement_mapping_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
