CREATE TABLE "purchase_products" (
	"organization_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"vat_rate_percent" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_by" text DEFAULT 'master-data' NOT NULL,
	"updated_by" text DEFAULT 'master-data' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_products_organization_id_code_pk" PRIMARY KEY("organization_id","code"),
	CONSTRAINT "purchase_products_code_not_blank" CHECK (btrim("purchase_products"."code") <> ''),
	CONSTRAINT "purchase_products_name_not_blank" CHECK (btrim("purchase_products"."name") <> ''),
	CONSTRAINT "purchase_products_vat_rate" CHECK ("purchase_products"."vat_rate_percent" in (8, 10)),
	CONSTRAINT "purchase_products_version_positive" CHECK ("purchase_products"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "purchase_products" ADD CONSTRAINT "purchase_products_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "purchase_products_active_name_idx" ON "purchase_products" USING btree ("organization_id","is_active","name");
