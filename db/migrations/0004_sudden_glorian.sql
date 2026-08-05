CREATE TABLE "api_credentials" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"actor_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_credentials_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "api_credentials_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "api_credentials_active_status" CHECK ("api_credentials"."status" in ('active','revoked'))
);
--> statement-breakpoint
CREATE TABLE "api_idempotency_records" (
	"organization_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"operation" text NOT NULL,
	"request_hash" text NOT NULL,
	"response_body" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_idempotency_records_organization_id_idempotency_key_pk" PRIMARY KEY("organization_id","idempotency_key"),
	CONSTRAINT "idempotency_operation_not_blank" CHECK (btrim("api_idempotency_records"."operation") <> '')
);
--> statement-breakpoint
CREATE TABLE "resource_audit_events" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_key" text NOT NULL,
	"resource_version" bigint NOT NULL,
	"action" text NOT NULL,
	"actor_id" text NOT NULL,
	"correlation_id" text NOT NULL,
	"before_state" jsonb,
	"after_state" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resource_audit_events_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "resource_audit_version_positive" CHECK ("resource_audit_events"."resource_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "resource_versions" (
	"organization_id" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_key" text NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resource_versions_organization_id_resource_type_resource_key_pk" PRIMARY KEY("organization_id","resource_type","resource_key"),
	CONSTRAINT "resource_versions_positive" CHECK ("resource_versions"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "api_credentials" ADD CONSTRAINT "api_credentials_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_idempotency_records" ADD CONSTRAINT "api_idempotency_records_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_audit_events" ADD CONSTRAINT "resource_audit_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_versions" ADD CONSTRAINT "resource_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;