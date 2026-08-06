ALTER TABLE "commercial_documents" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "commercial_documents" ADD CONSTRAINT "commercial_documents_credit_reason" CHECK (("commercial_documents"."type" = 'credit_note' and btrim("commercial_documents"."reason") <> '') or ("commercial_documents"."type" <> 'credit_note' and "commercial_documents"."reason" is null));--> statement-breakpoint
CREATE TABLE "external_references" (
	"organization_id" text NOT NULL,
	"system" text NOT NULL,
	"external_id" text NOT NULL,
	"document_id" text,
	"expense_id" text,
	"canonical_url" text,
	"checksum" text,
	"version" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "external_references_organization_id_system_external_id_pk" PRIMARY KEY("organization_id","system","external_id"),
	CONSTRAINT "external_references_system_not_blank" CHECK (btrim("external_references"."system") <> ''),
	CONSTRAINT "external_references_external_id_not_blank" CHECK (btrim("external_references"."external_id") <> ''),
	CONSTRAINT "external_references_target_present" CHECK (("external_references"."document_id" is not null or "external_references"."expense_id" is not null)),
	CONSTRAINT "external_references_target_exclusive" CHECK (not ("external_references"."document_id" is not null and "external_references"."expense_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "external_references" ADD CONSTRAINT "external_references_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_references" ADD CONSTRAINT "external_references_document_fk" FOREIGN KEY ("organization_id","document_id") REFERENCES "public"."commercial_documents"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_references" ADD CONSTRAINT "external_references_expense_fk" FOREIGN KEY ("organization_id","expense_id") REFERENCES "public"."expenses"("organization_id","id") ON DELETE cascade ON UPDATE no action;
