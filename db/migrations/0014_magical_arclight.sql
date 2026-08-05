CREATE TYPE "public"."evidence_review_state" AS ENUM('pending', 'accepted', 'rejected', 'needs_review');--> statement-breakpoint
CREATE TYPE "public"."evidence_version_status" AS ENUM('active', 'superseded', 'quarantined');--> statement-breakpoint
CREATE TABLE "evidence_access_events" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"evidence_id" text NOT NULL,
	"version_number" integer NOT NULL,
	"action" text NOT NULL,
	"actor_id" text NOT NULL,
	"reason" text,
	"correlation_id" text NOT NULL,
	"expires_at" timestamp with time zone,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_access_events_organization_id_id_pk" PRIMARY KEY("organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "evidence_records" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"evidence_type" text NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_records_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "evidence_records_subject_type" CHECK ("evidence_records"."subject_type" in ('commercial_document','expense','contract','project','milestone')),
	CONSTRAINT "evidence_records_subject_not_blank" CHECK (btrim("evidence_records"."subject_id") <> ''),
	CONSTRAINT "evidence_records_type_not_blank" CHECK (btrim("evidence_records"."evidence_type") <> ''),
	CONSTRAINT "evidence_records_current_version" CHECK ("evidence_records"."current_version" > 0),
	CONSTRAINT "evidence_records_version" CHECK ("evidence_records"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "evidence_versions" (
	"organization_id" text NOT NULL,
	"evidence_id" text NOT NULL,
	"version_number" integer NOT NULL,
	"status" "evidence_version_status" DEFAULT 'active' NOT NULL,
	"review_state" "evidence_review_state" DEFAULT 'pending' NOT NULL,
	"object_bucket" text NOT NULL,
	"object_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"declared_media_type" text NOT NULL,
	"detected_media_type" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"sha256" text NOT NULL,
	"source" text NOT NULL,
	"supersedes_version" integer,
	"uploaded_by" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"review_reason" text,
	"review_reference" text,
	CONSTRAINT "evidence_versions_organization_id_evidence_id_version_number_pk" PRIMARY KEY("organization_id","evidence_id","version_number"),
	CONSTRAINT "evidence_versions_object_key_unique" UNIQUE("organization_id","object_key"),
	CONSTRAINT "evidence_versions_number" CHECK ("evidence_versions"."version_number" > 0),
	CONSTRAINT "evidence_versions_size" CHECK ("evidence_versions"."byte_size" > 0),
	CONSTRAINT "evidence_versions_sha256" CHECK ("evidence_versions"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "evidence_versions_filename" CHECK (btrim("evidence_versions"."original_filename") <> ''),
	CONSTRAINT "evidence_versions_review_metadata" CHECK (("evidence_versions"."review_state" = 'pending' and "evidence_versions"."reviewed_by" is null and "evidence_versions"."reviewed_at" is null and "evidence_versions"."review_reason" is null) or ("evidence_versions"."review_state" <> 'pending' and "evidence_versions"."reviewed_by" is not null and "evidence_versions"."reviewed_at" is not null and "evidence_versions"."review_reason" is not null and btrim("evidence_versions"."review_reason") <> ''))
);
--> statement-breakpoint
ALTER TABLE "evidence_access_events" ADD CONSTRAINT "evidence_access_events_version_fk" FOREIGN KEY ("organization_id","evidence_id","version_number") REFERENCES "public"."evidence_versions"("organization_id","evidence_id","version_number") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_versions" ADD CONSTRAINT "evidence_versions_record_fk" FOREIGN KEY ("organization_id","evidence_id") REFERENCES "public"."evidence_records"("organization_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX evidence_versions_org_sha256_idx ON evidence_versions(organization_id,sha256);
--> statement-breakpoint
CREATE FUNCTION prevent_evidence_version_integrity_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.object_bucket IS DISTINCT FROM OLD.object_bucket OR NEW.object_key IS DISTINCT FROM OLD.object_key OR
     NEW.original_filename IS DISTINCT FROM OLD.original_filename OR NEW.declared_media_type IS DISTINCT FROM OLD.declared_media_type OR
     NEW.detected_media_type IS DISTINCT FROM OLD.detected_media_type OR NEW.byte_size IS DISTINCT FROM OLD.byte_size OR
     NEW.sha256 IS DISTINCT FROM OLD.sha256 OR NEW.source IS DISTINCT FROM OLD.source OR
     NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by OR NEW.uploaded_at IS DISTINCT FROM OLD.uploaded_at OR
     NEW.supersedes_version IS DISTINCT FROM OLD.supersedes_version THEN
    RAISE EXCEPTION 'EVIDENCE_VERSION_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER evidence_versions_integrity_immutable BEFORE UPDATE ON evidence_versions
FOR EACH ROW EXECUTE FUNCTION prevent_evidence_version_integrity_mutation();
--> statement-breakpoint
CREATE FUNCTION prevent_append_only_evidence_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'EVIDENCE_AUDIT_APPEND_ONLY' USING ERRCODE = '55000';
END $$;
--> statement-breakpoint
CREATE TRIGGER evidence_access_events_append_only BEFORE UPDATE OR DELETE ON evidence_access_events
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_evidence_mutation();
