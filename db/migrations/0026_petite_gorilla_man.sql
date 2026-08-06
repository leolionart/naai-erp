CREATE TYPE "public"."forecast_component_direction" AS ENUM('increase', 'decrease');--> statement-breakpoint
CREATE TYPE "public"."forecast_component_section" AS ENUM('revenue', 'expense', 'cash');--> statement-breakpoint
CREATE TABLE "forecast_components" (
	"organization_id" text NOT NULL,
	"forecast_version_id" text NOT NULL,
	"id" text NOT NULL,
	"section" "forecast_component_section" NOT NULL,
	"kind" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"direction" "forecast_component_direction" NOT NULL,
	"probability_bps" integer DEFAULT 10000 NOT NULL,
	"scheduled_on" date,
	"source_type" text,
	"source_id" text,
	"commercial_root_type" text,
	"commercial_root_id" text,
	"source_identity_key" text NOT NULL,
	"currency" text NOT NULL,
	"source_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dimensions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"note" text,
	"excluded" boolean DEFAULT false NOT NULL,
	"excluded_by" text,
	"excluded_at" timestamp with time zone,
	"exclusion_reason" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"review_reason" text,
	"version" bigint DEFAULT 1 NOT NULL,
	"reason" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "forecast_components_organization_id_forecast_version_id_id_pk" PRIMARY KEY("organization_id","forecast_version_id","id"),
	CONSTRAINT "forecast_component_kind" CHECK (btrim("forecast_components"."kind") <> ''),
	CONSTRAINT "forecast_component_amount" CHECK ("forecast_components"."amount_minor" >= 0),
	CONSTRAINT "forecast_component_currency" CHECK ("forecast_components"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "forecast_component_probability" CHECK ("forecast_components"."probability_bps" between 0 and 10000 and ("forecast_components"."kind" = 'weighted_pipeline' or "forecast_components"."probability_bps" = 10000)),
	CONSTRAINT "forecast_component_source" CHECK ("forecast_components"."source_type" is not null and btrim("forecast_components"."source_type") <> '' and "forecast_components"."source_id" is not null and btrim("forecast_components"."source_id") <> '' and "forecast_components"."scheduled_on" is not null and (("forecast_components"."commercial_root_type" is null and "forecast_components"."commercial_root_id" is null) or ("forecast_components"."commercial_root_type" is not null and btrim("forecast_components"."commercial_root_type") <> '' and "forecast_components"."commercial_root_id" is not null and btrim("forecast_components"."commercial_root_id") <> '')) and (("forecast_components"."kind" = 'manual_adjustment' and "forecast_components"."source_type" = 'manual' and "forecast_components"."commercial_root_type" is null) or ("forecast_components"."kind" <> 'manual_adjustment' and "forecast_components"."source_type" <> 'manual')) and ("forecast_components"."section" <> 'revenue' or "forecast_components"."kind" = 'manual_adjustment' or "forecast_components"."commercial_root_type" is not null)),
	CONSTRAINT "forecast_component_reason" CHECK (btrim("forecast_components"."reason") <> ''),
	CONSTRAINT "forecast_component_version" CHECK ("forecast_components"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "forecast_versions" ADD COLUMN "composition_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "forecast_versions" ADD COLUMN "composition_snapshotted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "forecast_components" ADD CONSTRAINT "forecast_components_version_fk" FOREIGN KEY ("organization_id","forecast_version_id") REFERENCES "public"."forecast_versions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "forecast_component_commercial_root_date_unique" ON "forecast_components" USING btree ("organization_id","forecast_version_id","section","source_identity_key","scheduled_on") WHERE "forecast_components"."source_type" <> 'manual' and "forecast_components"."excluded" = false;--> statement-breakpoint
CREATE INDEX "forecast_component_version_section_idx" ON "forecast_components" USING btree ("organization_id","forecast_version_id","section","scheduled_on");--> statement-breakpoint
ALTER TABLE "forecast_versions" ADD CONSTRAINT "forecast_composition_snapshot_pair" CHECK (("forecast_versions"."composition_snapshot" is null and "forecast_versions"."composition_snapshotted_at" is null) or ("forecast_versions"."composition_snapshot" is not null and "forecast_versions"."composition_snapshotted_at" is not null));