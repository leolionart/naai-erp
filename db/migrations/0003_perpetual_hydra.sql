CREATE TYPE "public"."contract_type" AS ENUM('fixed_fee', 'time_and_materials', 'retainer', 'internal');--> statement-breakpoint
CREATE TYPE "public"."party_role" AS ENUM('client', 'supplier', 'freelancer', 'employee');--> statement-breakpoint
CREATE TYPE "public"."party_status" AS ENUM('active', 'inactive', 'merged');--> statement-breakpoint
CREATE TYPE "public"."project_state" AS ENUM('planned', 'active', 'on_hold', 'completed', 'closed');--> statement-breakpoint
CREATE TABLE "contracts" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"project_id" text NOT NULL,
	"reference" text NOT NULL,
	"signed_on" date,
	"value_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contracts_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "contracts_org_reference_unique" UNIQUE("organization_id","reference"),
	CONSTRAINT "contracts_value_nonnegative" CHECK ("contracts"."value_minor" >= 0),
	CONSTRAINT "contracts_currency_iso3" CHECK ("contracts"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "milestones" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"contract_id" text NOT NULL,
	"name" text NOT NULL,
	"due_on" date,
	"amount_minor" bigint NOT NULL,
	"sequence" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "milestones_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "milestones_contract_sequence_unique" UNIQUE("organization_id","contract_id","sequence"),
	CONSTRAINT "milestones_amount_nonnegative" CHECK ("milestones"."amount_minor" >= 0),
	CONSTRAINT "milestones_sequence_positive" CHECK ("milestones"."sequence" > 0)
);
--> statement-breakpoint
CREATE TABLE "parties" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"display_name" text NOT NULL,
	"normalized_tax_id" text,
	"status" "party_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "parties_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "parties_name_not_blank" CHECK (btrim("parties"."display_name") <> '')
);
--> statement-breakpoint
CREATE TABLE "party_bank_accounts" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"party_id" text NOT NULL,
	"bank_code" text NOT NULL,
	"normalized_account_number" text NOT NULL,
	"account_holder_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "party_bank_accounts_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "party_bank_accounts_org_number_unique" UNIQUE("organization_id","bank_code","normalized_account_number")
);
--> statement-breakpoint
CREATE TABLE "party_external_references" (
	"organization_id" text NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"party_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "party_external_references_organization_id_source_external_id_pk" PRIMARY KEY("organization_id","source","external_id")
);
--> statement-breakpoint
CREATE TABLE "party_merge_links" (
	"organization_id" text NOT NULL,
	"source_party_id" text NOT NULL,
	"target_party_id" text NOT NULL,
	"reason" text NOT NULL,
	"merged_by" text NOT NULL,
	"merged_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "party_merge_links_organization_id_source_party_id_pk" PRIMARY KEY("organization_id","source_party_id"),
	CONSTRAINT "party_merge_distinct" CHECK ("party_merge_links"."source_party_id" <> "party_merge_links"."target_party_id"),
	CONSTRAINT "party_merge_reason_not_blank" CHECK (btrim("party_merge_links"."reason") <> '')
);
--> statement-breakpoint
CREATE TABLE "party_roles" (
	"organization_id" text NOT NULL,
	"party_id" text NOT NULL,
	"role" "party_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "party_roles_organization_id_party_id_role_pk" PRIMARY KEY("organization_id","party_id","role")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"client_party_id" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"contract_type" "contract_type" NOT NULL,
	"currency" text NOT NULL,
	"budget_minor" bigint NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"state" "project_state" DEFAULT 'planned' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "projects_org_code_unique" UNIQUE("organization_id","code"),
	CONSTRAINT "projects_currency_iso3" CHECK ("projects"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "projects_budget_nonnegative" CHECK ("projects"."budget_minor" >= 0),
	CONSTRAINT "projects_date_order" CHECK ("projects"."ends_on" is null or "projects"."ends_on" >= "projects"."starts_on")
);
--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_project_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "public"."projects"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_contract_fk" FOREIGN KEY ("organization_id","contract_id") REFERENCES "public"."contracts"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parties" ADD CONSTRAINT "parties_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_bank_accounts" ADD CONSTRAINT "party_bank_accounts_party_fk" FOREIGN KEY ("organization_id","party_id") REFERENCES "public"."parties"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_external_references" ADD CONSTRAINT "party_external_refs_party_fk" FOREIGN KEY ("organization_id","party_id") REFERENCES "public"."parties"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_merge_links" ADD CONSTRAINT "party_merge_source_fk" FOREIGN KEY ("organization_id","source_party_id") REFERENCES "public"."parties"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_merge_links" ADD CONSTRAINT "party_merge_target_fk" FOREIGN KEY ("organization_id","target_party_id") REFERENCES "public"."parties"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_roles" ADD CONSTRAINT "party_roles_party_fk" FOREIGN KEY ("organization_id","party_id") REFERENCES "public"."parties"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_fk" FOREIGN KEY ("organization_id","client_party_id") REFERENCES "public"."parties"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_membership_fk" FOREIGN KEY ("organization_id","owner_user_id") REFERENCES "public"."organization_memberships"("organization_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "parties_org_tax_id_unique" ON "parties" USING btree ("organization_id","normalized_tax_id") WHERE "parties"."normalized_tax_id" is not null;