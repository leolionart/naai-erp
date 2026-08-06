CREATE TYPE "public"."accountant_export_format" AS ENUM('csv', 'xlsx');--> statement-breakpoint
CREATE TYPE "public"."accountant_export_state" AS ENUM('generated', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."report_snapshot_readiness" AS ENUM('final', 'review_required');--> statement-breakpoint
CREATE TYPE "public"."report_snapshot_state" AS ENUM('captured');--> statement-breakpoint
CREATE TABLE "accountant_exports" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"version" integer NOT NULL,
	"previous_export_id" text,
	"previous_export_version" integer,
	"snapshot_id" text NOT NULL,
	"snapshot_version" integer NOT NULL,
	"format" "accountant_export_format" NOT NULL,
	"state" "accountant_export_state" DEFAULT 'generated' NOT NULL,
	"label" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"content" "bytea" NOT NULL,
	"content_hash" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"media_type" text NOT NULL,
	"filename" text NOT NULL,
	"generated_by" text NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_by" text,
	"superseded_at" timestamp with time zone,
	"supersede_reason" text,
	CONSTRAINT "accountant_exports_organization_id_id_version_pk" PRIMARY KEY("organization_id","id","version"),
	CONSTRAINT "accountant_export_content_unique" UNIQUE("organization_id","snapshot_id","snapshot_version","format","content_hash"),
	CONSTRAINT "accountant_export_version_positive" CHECK ("accountant_exports"."version" > 0),
	CONSTRAINT "accountant_export_snapshot_version_positive" CHECK ("accountant_exports"."snapshot_version" > 0),
	CONSTRAINT "accountant_export_previous_pair" CHECK (("accountant_exports"."previous_export_id" is null and "accountant_exports"."previous_export_version" is null) or ("accountant_exports"."previous_export_id" is not null and "accountant_exports"."previous_export_version" is not null and "accountant_exports"."previous_export_version" > 0)),
	CONSTRAINT "accountant_export_label_not_blank" CHECK (btrim("accountant_exports"."label") <> ''),
	CONSTRAINT "accountant_export_manifest_object" CHECK (jsonb_typeof("accountant_exports"."manifest") = 'object'),
	CONSTRAINT "accountant_export_content_hash_not_blank" CHECK (btrim("accountant_exports"."content_hash") <> ''),
	CONSTRAINT "accountant_export_size_nonnegative" CHECK ("accountant_exports"."size_bytes" >= 0),
	CONSTRAINT "accountant_export_media_type_not_blank" CHECK (btrim("accountant_exports"."media_type") <> ''),
	CONSTRAINT "accountant_export_filename_not_blank" CHECK (btrim("accountant_exports"."filename") <> ''),
	CONSTRAINT "accountant_export_supersede_metadata" CHECK (("accountant_exports"."state" = 'generated' and "accountant_exports"."superseded_by" is null and "accountant_exports"."superseded_at" is null and "accountant_exports"."supersede_reason" is null) or ("accountant_exports"."state" = 'superseded' and "accountant_exports"."superseded_by" is not null and "accountant_exports"."superseded_at" is not null and btrim(coalesce("accountant_exports"."supersede_reason", '')) <> ''))
);
--> statement-breakpoint
CREATE TABLE "report_snapshots" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"version" integer NOT NULL,
	"previous_snapshot_id" text,
	"previous_snapshot_version" integer,
	"report_kind" text NOT NULL,
	"state" "report_snapshot_state" DEFAULT 'captured' NOT NULL,
	"readiness" "report_snapshot_readiness" NOT NULL,
	"period_starts_on" date NOT NULL,
	"period_ends_on" date NOT NULL,
	"dimensions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"accounting_basis" text NOT NULL,
	"framework" text,
	"currency" text NOT NULL,
	"canonical_request" jsonb NOT NULL,
	"request_hash" text NOT NULL,
	"canonical_result" jsonb NOT NULL,
	"result_hash" text NOT NULL,
	"formula_versions" jsonb NOT NULL,
	"mapping_versions" jsonb NOT NULL,
	"ledger_cutoff" jsonb NOT NULL,
	"source_manifest" jsonb NOT NULL,
	"source_fingerprint" text NOT NULL,
	"readiness_summary" jsonb NOT NULL,
	"unresolved_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"captured_by" text NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_snapshots_organization_id_id_version_pk" PRIMARY KEY("organization_id","id","version"),
	CONSTRAINT "report_snapshot_reproduction_unique" UNIQUE("organization_id","report_kind","request_hash","source_fingerprint"),
	CONSTRAINT "report_snapshot_version_positive" CHECK ("report_snapshots"."version" > 0),
	CONSTRAINT "report_snapshot_previous_pair" CHECK (("report_snapshots"."previous_snapshot_id" is null and "report_snapshots"."previous_snapshot_version" is null) or ("report_snapshots"."previous_snapshot_id" is not null and "report_snapshots"."previous_snapshot_version" is not null and "report_snapshots"."previous_snapshot_version" > 0)),
	CONSTRAINT "report_snapshot_period_order" CHECK ("report_snapshots"."period_ends_on" >= "report_snapshots"."period_starts_on"),
	CONSTRAINT "report_snapshot_kind_not_blank" CHECK (btrim("report_snapshots"."report_kind") <> ''),
	CONSTRAINT "report_snapshot_basis_not_blank" CHECK (btrim("report_snapshots"."accounting_basis") <> ''),
	CONSTRAINT "report_snapshot_currency" CHECK ("report_snapshots"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "report_snapshot_request_hash_not_blank" CHECK (btrim("report_snapshots"."request_hash") <> ''),
	CONSTRAINT "report_snapshot_result_hash_not_blank" CHECK (btrim("report_snapshots"."result_hash") <> ''),
	CONSTRAINT "report_snapshot_source_fingerprint_not_blank" CHECK (btrim("report_snapshots"."source_fingerprint") <> ''),
	CONSTRAINT "report_snapshot_dimensions_object" CHECK (jsonb_typeof("report_snapshots"."dimensions") = 'object'),
	CONSTRAINT "report_snapshot_canonical_objects" CHECK (jsonb_typeof("report_snapshots"."canonical_request") = 'object' and jsonb_typeof("report_snapshots"."canonical_result") = 'object'),
	CONSTRAINT "report_snapshot_version_objects" CHECK (jsonb_typeof("report_snapshots"."formula_versions") = 'object' and jsonb_typeof("report_snapshots"."mapping_versions") = 'object'),
	CONSTRAINT "report_snapshot_ledger_cutoff_object" CHECK (jsonb_typeof("report_snapshots"."ledger_cutoff") = 'object'),
	CONSTRAINT "report_snapshot_source_manifest_array" CHECK (jsonb_typeof("report_snapshots"."source_manifest") = 'array'),
	CONSTRAINT "report_snapshot_readiness_summary_object" CHECK (jsonb_typeof("report_snapshots"."readiness_summary") = 'object'),
	CONSTRAINT "report_snapshot_unresolved_items_array" CHECK (jsonb_typeof("report_snapshots"."unresolved_items") = 'array')
);
--> statement-breakpoint
ALTER TABLE "accountant_exports" ADD CONSTRAINT "accountant_exports_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountant_exports" ADD CONSTRAINT "accountant_exports_snapshot_fk" FOREIGN KEY ("organization_id","snapshot_id","snapshot_version") REFERENCES "public"."report_snapshots"("organization_id","id","version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountant_exports" ADD CONSTRAINT "accountant_exports_previous_fk" FOREIGN KEY ("organization_id","previous_export_id","previous_export_version") REFERENCES "public"."accountant_exports"("organization_id","id","version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_snapshots" ADD CONSTRAINT "report_snapshots_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_snapshots" ADD CONSTRAINT "report_snapshots_previous_fk" FOREIGN KEY ("organization_id","previous_snapshot_id","previous_snapshot_version") REFERENCES "public"."report_snapshots"("organization_id","id","version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accountant_exports_snapshot_idx" ON "accountant_exports" USING btree ("organization_id","snapshot_id","snapshot_version");--> statement-breakpoint
CREATE INDEX "report_snapshots_period_idx" ON "report_snapshots" USING btree ("organization_id","report_kind","period_starts_on","period_ends_on");--> statement-breakpoint
CREATE FUNCTION prevent_report_snapshot_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'report snapshots are immutable; capture a new version' USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER report_snapshots_append_only BEFORE UPDATE OR DELETE ON "report_snapshots" FOR EACH ROW EXECUTE FUNCTION prevent_report_snapshot_mutation();--> statement-breakpoint
CREATE FUNCTION control_accountant_export_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'accountant exports cannot be deleted' USING ERRCODE = '55000';
  END IF;

  IF OLD.state <> 'generated'
     OR NEW.state <> 'superseded'
     OR (to_jsonb(NEW) - ARRAY['state', 'superseded_by', 'superseded_at', 'supersede_reason'])
        IS DISTINCT FROM
        (to_jsonb(OLD) - ARRAY['state', 'superseded_by', 'superseded_at', 'supersede_reason']) THEN
    RAISE EXCEPTION 'accountant exports only allow the audited generated-to-superseded transition' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER accountant_exports_controlled_mutation BEFORE UPDATE OR DELETE ON "accountant_exports" FOR EACH ROW EXECUTE FUNCTION control_accountant_export_mutation();
