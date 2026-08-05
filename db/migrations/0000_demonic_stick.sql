CREATE TYPE "public"."fiscal_period_state" AS ENUM('open', 'soft_locked', 'hard_locked');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('owner', 'finance_admin', 'accountant', 'project_manager', 'approver', 'viewer', 'integration');--> statement-breakpoint
CREATE TABLE "exchange_rates" (
	"id" text NOT NULL,
	"organization_id" text NOT NULL,
	"source_currency" text NOT NULL,
	"target_currency" text NOT NULL,
	"rate" numeric(38, 18) NOT NULL,
	"source" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exchange_rates_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "exchange_rates_observation_unique" UNIQUE("organization_id","source_currency","target_currency","source","observed_at"),
	CONSTRAINT "exchange_rates_source_currency_iso3" CHECK ("exchange_rates"."source_currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "exchange_rates_target_currency_iso3" CHECK ("exchange_rates"."target_currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "exchange_rates_different_currencies" CHECK ("exchange_rates"."source_currency" <> "exchange_rates"."target_currency"),
	CONSTRAINT "exchange_rates_positive" CHECK ("exchange_rates"."rate" > 0),
	CONSTRAINT "exchange_rates_source_not_blank" CHECK (btrim("exchange_rates"."source") <> '')
);
--> statement-breakpoint
CREATE TABLE "fiscal_periods" (
	"organization_id" text NOT NULL,
	"fiscal_year" integer NOT NULL,
	"period_number" integer NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"state" "fiscal_period_state" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fiscal_periods_organization_id_fiscal_year_period_number_pk" PRIMARY KEY("organization_id","fiscal_year","period_number"),
	CONSTRAINT "fiscal_periods_number_range" CHECK ("fiscal_periods"."period_number" between 1 and 53),
	CONSTRAINT "fiscal_periods_date_order" CHECK ("fiscal_periods"."starts_on" <= "fiscal_periods"."ends_on")
);
--> statement-breakpoint
CREATE TABLE "fiscal_years" (
	"organization_id" text NOT NULL,
	"year" integer NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fiscal_years_organization_id_year_pk" PRIMARY KEY("organization_id","year"),
	CONSTRAINT "fiscal_years_year_range" CHECK ("fiscal_years"."year" between 1900 and 9999),
	CONSTRAINT "fiscal_years_date_order" CHECK ("fiscal_years"."starts_on" <= "fiscal_years"."ends_on")
);
--> statement-breakpoint
CREATE TABLE "membership_roles" (
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_roles_organization_id_user_id_role_pk" PRIMARY KEY("organization_id","user_id","role")
);
--> statement-breakpoint
CREATE TABLE "organization_memberships" (
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_memberships_organization_id_user_id_pk" PRIMARY KEY("organization_id","user_id"),
	CONSTRAINT "organization_memberships_org_user_unique" UNIQUE("organization_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"legal_name" text NOT NULL,
	"base_currency" text NOT NULL,
	"timezone" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_legal_name_not_blank" CHECK (btrim("organizations"."legal_name") <> ''),
	CONSTRAINT "organizations_currency_iso3" CHECK ("organizations"."base_currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "organizations_timezone_not_blank" CHECK (btrim("organizations"."timezone") <> '')
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_email_not_blank" CHECK (btrim("users"."email") <> '')
);
--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_periods" ADD CONSTRAINT "fiscal_periods_fiscal_year_fk" FOREIGN KEY ("organization_id","fiscal_year") REFERENCES "public"."fiscal_years"("organization_id","year") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_years" ADD CONSTRAINT "fiscal_years_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_membership_fk" FOREIGN KEY ("organization_id","user_id") REFERENCES "public"."organization_memberships"("organization_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;