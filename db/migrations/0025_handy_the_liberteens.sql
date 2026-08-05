CREATE TYPE "public"."forecast_scenario" AS ENUM('base', 'best', 'worst', 'custom');--> statement-breakpoint
CREATE TYPE "public"."forecast_snapshot_kind" AS ENUM('working', 'month_end');--> statement-breakpoint
CREATE TYPE "public"."planning_actual_basis" AS ENUM('recognized', 'invoiced', 'collected');--> statement-breakpoint
CREATE TYPE "public"."planning_version_state" AS ENUM('draft', 'published', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."target_period_kind" AS ENUM('month', 'quarter', 'year');--> statement-breakpoint
CREATE TABLE "forecast_versions" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"version_number" integer NOT NULL,
	"previous_version_id" text,
	"scenario" "forecast_scenario" NOT NULL,
	"custom_scenario_name" text,
	"snapshot_kind" "forecast_snapshot_kind" NOT NULL,
	"as_of_date" date NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"actual_basis" "planning_actual_basis" NOT NULL,
	"currency" text NOT NULL,
	"team_id" text,
	"service_line_code" text,
	"owner_id" text,
	"state" "planning_version_state" DEFAULT 'draft' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"reason" text NOT NULL,
	"created_by" text NOT NULL,
	"published_by" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "forecast_versions_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "forecast_version_positive" CHECK ("forecast_versions"."version_number" > 0),
	CONSTRAINT "forecast_date_order" CHECK ("forecast_versions"."ends_on" >= "forecast_versions"."starts_on"),
	CONSTRAINT "forecast_as_of_range" CHECK ("forecast_versions"."as_of_date" <= "forecast_versions"."ends_on"),
	CONSTRAINT "forecast_currency" CHECK ("forecast_versions"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "forecast_reason" CHECK (btrim("forecast_versions"."reason") <> ''),
	CONSTRAINT "forecast_custom_name" CHECK (("forecast_versions"."scenario" = 'custom' and "forecast_versions"."custom_scenario_name" is not null and btrim("forecast_versions"."custom_scenario_name") <> '') or ("forecast_versions"."scenario" <> 'custom' and "forecast_versions"."custom_scenario_name" is null))
);
--> statement-breakpoint
CREATE TABLE "planning_audit_events" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text NOT NULL,
	"action" text NOT NULL,
	"actor_id" text NOT NULL,
	"reason" text NOT NULL,
	"correlation_id" text NOT NULL,
	"resource_version" bigint NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "planning_audit_events_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "planning_audit_reason" CHECK (btrim("planning_audit_events"."reason") <> '')
);
--> statement-breakpoint
CREATE TABLE "revenue_target_versions" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"version_number" integer NOT NULL,
	"previous_version_id" text,
	"period_kind" "target_period_kind" NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"actual_basis" "planning_actual_basis" NOT NULL,
	"currency" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"team_id" text,
	"service_line_code" text,
	"owner_id" text,
	"state" "planning_version_state" DEFAULT 'draft' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"reason" text NOT NULL,
	"created_by" text NOT NULL,
	"published_by" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "revenue_target_versions_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "revenue_target_version_positive" CHECK ("revenue_target_versions"."version_number" > 0),
	CONSTRAINT "revenue_target_amount_nonnegative" CHECK ("revenue_target_versions"."amount_minor" >= 0),
	CONSTRAINT "revenue_target_date_order" CHECK ("revenue_target_versions"."ends_on" >= "revenue_target_versions"."starts_on"),
	CONSTRAINT "revenue_target_currency" CHECK ("revenue_target_versions"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "revenue_target_reason" CHECK (btrim("revenue_target_versions"."reason") <> '')
);
--> statement-breakpoint
ALTER TABLE "forecast_versions" ADD CONSTRAINT "forecast_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecast_versions" ADD CONSTRAINT "forecast_previous_fk" FOREIGN KEY ("organization_id","previous_version_id") REFERENCES "public"."forecast_versions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_audit_events" ADD CONSTRAINT "planning_audit_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_target_versions" ADD CONSTRAINT "revenue_target_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_target_versions" ADD CONSTRAINT "revenue_target_previous_fk" FOREIGN KEY ("organization_id","previous_version_id") REFERENCES "public"."revenue_target_versions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "forecast_period_idx" ON "forecast_versions" USING btree ("organization_id","starts_on","ends_on","as_of_date");--> statement-breakpoint
CREATE INDEX "planning_audit_resource_idx" ON "planning_audit_events" USING btree ("organization_id","resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "revenue_target_period_idx" ON "revenue_target_versions" USING btree ("organization_id","starts_on","ends_on");