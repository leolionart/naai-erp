CREATE TABLE "portable_data_packages" (
  "organization_id" text NOT NULL,
  "id" text NOT NULL,
  "schema_version" integer NOT NULL,
  "as_of" date NOT NULL,
  "format" text NOT NULL,
  "manifest" jsonb NOT NULL,
  "schemas" jsonb NOT NULL,
  "content" bytea NOT NULL,
  "content_hash" text NOT NULL,
  "package_hash" text NOT NULL,
  "size_bytes" bigint NOT NULL,
  "media_type" text NOT NULL,
  "filename" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "request_hash" text NOT NULL,
  "generated_by" text NOT NULL,
  "correlation_id" text NOT NULL,
  "generated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "portable_data_packages_organization_id_id_pk" PRIMARY KEY("organization_id", "id"),
  CONSTRAINT "portable_data_packages_idempotency_unique" UNIQUE("organization_id", "idempotency_key"),
  CONSTRAINT "portable_data_packages_schema_version_positive" CHECK ("schema_version" > 0),
  CONSTRAINT "portable_data_packages_xlsx_only" CHECK ("format" = 'xlsx'),
  CONSTRAINT "portable_data_packages_content_hash_not_blank" CHECK (btrim("content_hash") <> ''),
  CONSTRAINT "portable_data_packages_package_hash_not_blank" CHECK (btrim("package_hash") <> ''),
  CONSTRAINT "portable_data_packages_size_nonnegative" CHECK ("size_bytes" >= 0)
);
--> statement-breakpoint
ALTER TABLE "portable_data_packages" ADD CONSTRAINT "portable_data_packages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "portable_data_packages_generated_idx" ON "portable_data_packages" USING btree ("organization_id", "generated_at");
--> statement-breakpoint
CREATE TABLE "portable_data_imports" (
  "organization_id" text NOT NULL,
  "id" text NOT NULL,
  "package_id" text NOT NULL,
  "state" text NOT NULL,
  "workbook_sha256" text NOT NULL,
  "package_hash" text NOT NULL,
  "inventory" jsonb NOT NULL,
  "parsed_sheets" jsonb NOT NULL,
  "dry_run_id" text,
  "dry_run" jsonb,
  "commit_result" jsonb,
  "inventory_idempotency_key" text NOT NULL,
  "dry_run_idempotency_key" text,
  "commit_idempotency_key" text,
  "actor_id" text NOT NULL,
  "correlation_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "portable_data_imports_organization_id_id_pk" PRIMARY KEY("organization_id", "id"),
  CONSTRAINT "portable_data_imports_inventory_idempotency_unique" UNIQUE("organization_id", "inventory_idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "portable_data_imports" ADD CONSTRAINT "portable_data_imports_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "portable_data_imports" ADD CONSTRAINT "portable_data_imports_package_fk" FOREIGN KEY ("organization_id","package_id") REFERENCES "public"."portable_data_packages"("organization_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "portable_data_imports_package_idx" ON "portable_data_imports" USING btree ("organization_id", "package_id");
