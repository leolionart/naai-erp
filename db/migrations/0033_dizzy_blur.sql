CREATE TYPE "public"."workbook_import_review_status" AS ENUM('pending_review', 'approved', 'ignored', 'posted');--> statement-breakpoint
CREATE TABLE "workbook_import_review_rows" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"import_identity" text NOT NULL,
	"source_identity" text NOT NULL,
	"workbook" text NOT NULL,
	"sheet" text NOT NULL,
	"source_row" integer NOT NULL,
	"kind" text NOT NULL,
	"proposed_resource_type" text NOT NULL,
	"proposed_resource_id" text,
	"status" "workbook_import_review_status" DEFAULT 'pending_review' NOT NULL,
	"review_flags" jsonb NOT NULL,
	"raw_data" jsonb NOT NULL,
	"mapped_data" jsonb NOT NULL,
	"resolution" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workbook_import_review_rows_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "workbook_import_review_rows_source_unique" UNIQUE("organization_id","source_identity")
);
--> statement-breakpoint
ALTER TABLE "workbook_import_review_rows" ADD CONSTRAINT "workbook_import_review_rows_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workbook_import_review_rows_import_idx" ON "workbook_import_review_rows" USING btree ("organization_id","import_identity");--> statement-breakpoint
CREATE INDEX "workbook_import_review_rows_status_idx" ON "workbook_import_review_rows" USING btree ("organization_id","status");