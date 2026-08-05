CREATE TYPE "public"."account_root_type" AS ENUM('asset', 'liability', 'equity', 'revenue', 'expense');--> statement-breakpoint
CREATE TYPE "public"."statutory_framework" AS ENUM('TT133', 'TT200');--> statement-breakpoint
CREATE TYPE "public"."tax_kind" AS ENUM('vat_input', 'vat_output', 'cit', 'withholding', 'other');--> statement-breakpoint
CREATE TYPE "public"."tax_review_state" AS ENUM('draft', 'accountant_approved', 'retired');--> statement-breakpoint
CREATE TABLE "account_hierarchy_edges" (
	"organization_id" text NOT NULL,
	"child_code" text NOT NULL,
	"child_root_type" "account_root_type" NOT NULL,
	"parent_code" text NOT NULL,
	"parent_root_type" "account_root_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_hierarchy_edges_organization_id_child_code_pk" PRIMARY KEY("organization_id","child_code"),
	CONSTRAINT "account_edges_not_self" CHECK ("account_hierarchy_edges"."child_code" <> "account_hierarchy_edges"."parent_code"),
	CONSTRAINT "account_edges_same_root" CHECK ("account_hierarchy_edges"."child_root_type" = "account_hierarchy_edges"."parent_root_type")
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"organization_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"root_type" "account_root_type" NOT NULL,
	"is_control_account" boolean DEFAULT false NOT NULL,
	"allow_manual_posting" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_organization_id_code_pk" PRIMARY KEY("organization_id","code"),
	CONSTRAINT "accounts_org_code_root_unique" UNIQUE("organization_id","code","root_type"),
	CONSTRAINT "accounts_code_not_blank" CHECK (btrim("accounts"."code") <> ''),
	CONSTRAINT "accounts_name_not_blank" CHECK (btrim("accounts"."name") <> ''),
	CONSTRAINT "accounts_control_manual_posting" CHECK (not "accounts"."is_control_account" or not "accounts"."allow_manual_posting")
);
--> statement-breakpoint
CREATE TABLE "statutory_account_mappings" (
	"organization_id" text NOT NULL,
	"account_code" text NOT NULL,
	"framework" "statutory_framework" NOT NULL,
	"statutory_code" text NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "statutory_account_mappings_organization_id_account_code_framework_effective_from_pk" PRIMARY KEY("organization_id","account_code","framework","effective_from"),
	CONSTRAINT "statutory_mappings_code_not_blank" CHECK (btrim("statutory_account_mappings"."statutory_code") <> ''),
	CONSTRAINT "statutory_mappings_date_order" CHECK ("statutory_account_mappings"."effective_to" is null or "statutory_account_mappings"."effective_to" > "statutory_account_mappings"."effective_from"),
	CONSTRAINT "statutory_mappings_approval_together" CHECK (("statutory_account_mappings"."approved_by" is null and "statutory_account_mappings"."approved_at" is null) or ("statutory_account_mappings"."approved_by" is not null and "statutory_account_mappings"."approved_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "tax_code_versions" (
	"organization_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"kind" "tax_kind" NOT NULL,
	"rate" numeric(12, 6) NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"review_state" "tax_review_state" DEFAULT 'draft' NOT NULL,
	"required_evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"review_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tax_code_versions_organization_id_code_effective_from_pk" PRIMARY KEY("organization_id","code","effective_from"),
	CONSTRAINT "tax_codes_code_not_blank" CHECK (btrim("tax_code_versions"."code") <> ''),
	CONSTRAINT "tax_codes_name_not_blank" CHECK (btrim("tax_code_versions"."name") <> ''),
	CONSTRAINT "tax_codes_rate_nonnegative" CHECK ("tax_code_versions"."rate" >= 0),
	CONSTRAINT "tax_codes_date_order" CHECK ("tax_code_versions"."effective_to" is null or "tax_code_versions"."effective_to" > "tax_code_versions"."effective_from"),
	CONSTRAINT "tax_codes_approval_metadata" CHECK ("tax_code_versions"."review_state" <> 'accountant_approved' or ("tax_code_versions"."reviewed_by" is not null and "tax_code_versions"."reviewed_at" is not null and btrim("tax_code_versions"."review_reason") <> ''))
);
--> statement-breakpoint
ALTER TABLE "account_hierarchy_edges" ADD CONSTRAINT "account_edges_child_fk" FOREIGN KEY ("organization_id","child_code","child_root_type") REFERENCES "public"."accounts"("organization_id","code","root_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_hierarchy_edges" ADD CONSTRAINT "account_edges_parent_fk" FOREIGN KEY ("organization_id","parent_code","parent_root_type") REFERENCES "public"."accounts"("organization_id","code","root_type") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statutory_account_mappings" ADD CONSTRAINT "statutory_mappings_account_fk" FOREIGN KEY ("organization_id","account_code") REFERENCES "public"."accounts"("organization_id","code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_code_versions" ADD CONSTRAINT "tax_code_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;