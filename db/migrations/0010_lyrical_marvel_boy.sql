CREATE TYPE "public"."commercial_document_state" AS ENUM('draft', 'captured', 'validated', 'verified', 'approved', 'issued', 'posted', 'partially_paid', 'paid', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."commercial_document_type" AS ENUM('sales_invoice', 'purchase_invoice', 'credit_note');--> statement-breakpoint
CREATE TABLE "commercial_document_allocations" (
	"organization_id" text NOT NULL,
	"document_id" text NOT NULL,
	"line_number" integer NOT NULL,
	"allocation_number" integer NOT NULL,
	"amount_minor" bigint NOT NULL,
	"dimensions" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commercial_document_allocations_organization_id_document_id_line_number_allocation_number_pk" PRIMARY KEY("organization_id","document_id","line_number","allocation_number"),
	CONSTRAINT "commercial_document_allocations_number" CHECK ("commercial_document_allocations"."allocation_number" > 0),
	CONSTRAINT "commercial_document_allocations_amount" CHECK ("commercial_document_allocations"."amount_minor" > 0),
	CONSTRAINT "commercial_document_allocations_dimensions" CHECK (jsonb_typeof("commercial_document_allocations"."dimensions") = 'object' and "commercial_document_allocations"."dimensions" <> '{}'::jsonb)
);
--> statement-breakpoint
CREATE TABLE "commercial_document_events" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"document_id" text NOT NULL,
	"from_state" "commercial_document_state" NOT NULL,
	"to_state" "commercial_document_state" NOT NULL,
	"actor_id" text NOT NULL,
	"reason" text NOT NULL,
	"correlation_id" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commercial_document_events_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "commercial_document_events_reason" CHECK (btrim("commercial_document_events"."reason") <> ''),
	CONSTRAINT "commercial_document_events_transition" CHECK ("commercial_document_events"."from_state" <> "commercial_document_events"."to_state")
);
--> statement-breakpoint
CREATE TABLE "commercial_document_lines" (
	"organization_id" text NOT NULL,
	"document_id" text NOT NULL,
	"line_number" integer NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(24, 6) NOT NULL,
	"unit_price_minor" bigint NOT NULL,
	"net_minor" bigint NOT NULL,
	"tax_minor" bigint NOT NULL,
	"gross_minor" bigint NOT NULL,
	"primary_account_code" text NOT NULL,
	"tax_account_code" text,
	"tax_code" text,
	"dimensions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commercial_document_lines_organization_id_document_id_line_number_pk" PRIMARY KEY("organization_id","document_id","line_number"),
	CONSTRAINT "commercial_document_lines_description" CHECK (btrim("commercial_document_lines"."description") <> ''),
	CONSTRAINT "commercial_document_lines_quantity" CHECK ("commercial_document_lines"."quantity" > 0),
	CONSTRAINT "commercial_document_lines_totals" CHECK ("commercial_document_lines"."unit_price_minor" >= 0 and "commercial_document_lines"."net_minor" > 0 and "commercial_document_lines"."tax_minor" >= 0 and "commercial_document_lines"."gross_minor" = "commercial_document_lines"."net_minor" + "commercial_document_lines"."tax_minor"),
	CONSTRAINT "commercial_document_lines_tax_account" CHECK (("commercial_document_lines"."tax_minor" = 0 and "commercial_document_lines"."tax_account_code" is null) or ("commercial_document_lines"."tax_minor" > 0 and "commercial_document_lines"."tax_account_code" is not null))
);
--> statement-breakpoint
CREATE TABLE "commercial_documents" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"type" "commercial_document_type" NOT NULL,
	"state" "commercial_document_state" DEFAULT 'draft' NOT NULL,
	"document_number" text NOT NULL,
	"series" text,
	"fiscal_year" integer NOT NULL,
	"party_id" text NOT NULL,
	"document_date" date NOT NULL,
	"due_date" date NOT NULL,
	"currency" text NOT NULL,
	"net_minor" bigint NOT NULL,
	"tax_minor" bigint NOT NULL,
	"gross_minor" bigint NOT NULL,
	"control_account_code" text NOT NULL,
	"original_document_id" text,
	"journal_id" text,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"issued_or_posted_by" text,
	"issued_or_posted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commercial_documents_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "commercial_documents_number_unique" UNIQUE("organization_id","type","series","fiscal_year","document_number"),
	CONSTRAINT "commercial_documents_number_not_blank" CHECK (btrim("commercial_documents"."document_number") <> ''),
	CONSTRAINT "commercial_documents_currency_iso3" CHECK ("commercial_documents"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "commercial_documents_due_date" CHECK ("commercial_documents"."due_date" >= "commercial_documents"."document_date"),
	CONSTRAINT "commercial_documents_totals" CHECK ("commercial_documents"."net_minor" >= 0 and "commercial_documents"."tax_minor" >= 0 and "commercial_documents"."gross_minor" = "commercial_documents"."net_minor" + "commercial_documents"."tax_minor" and "commercial_documents"."gross_minor" > 0),
	CONSTRAINT "commercial_documents_credit_origin" CHECK (("commercial_documents"."type" = 'credit_note' and "commercial_documents"."original_document_id" is not null) or ("commercial_documents"."type" <> 'credit_note' and "commercial_documents"."original_document_id" is null)),
	CONSTRAINT "commercial_documents_version_positive" CHECK ("commercial_documents"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "commercial_document_allocations" ADD CONSTRAINT "commercial_document_allocations_line_fk" FOREIGN KEY ("organization_id","document_id","line_number") REFERENCES "public"."commercial_document_lines"("organization_id","document_id","line_number") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_document_events" ADD CONSTRAINT "commercial_document_events_document_fk" FOREIGN KEY ("organization_id","document_id") REFERENCES "public"."commercial_documents"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_document_lines" ADD CONSTRAINT "commercial_document_lines_document_fk" FOREIGN KEY ("organization_id","document_id") REFERENCES "public"."commercial_documents"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_document_lines" ADD CONSTRAINT "commercial_document_lines_primary_account_fk" FOREIGN KEY ("organization_id","primary_account_code") REFERENCES "public"."accounts"("organization_id","code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_document_lines" ADD CONSTRAINT "commercial_document_lines_tax_account_fk" FOREIGN KEY ("organization_id","tax_account_code") REFERENCES "public"."accounts"("organization_id","code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_documents" ADD CONSTRAINT "commercial_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_documents" ADD CONSTRAINT "commercial_documents_party_fk" FOREIGN KEY ("organization_id","party_id") REFERENCES "public"."parties"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_documents" ADD CONSTRAINT "commercial_documents_original_fk" FOREIGN KEY ("organization_id","original_document_id") REFERENCES "public"."commercial_documents"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_documents" ADD CONSTRAINT "commercial_documents_journal_fk" FOREIGN KEY ("organization_id","journal_id") REFERENCES "public"."journal_entries"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_documents" ADD CONSTRAINT "commercial_documents_control_account_fk" FOREIGN KEY ("organization_id","control_account_code") REFERENCES "public"."accounts"("organization_id","code") ON DELETE restrict ON UPDATE no action;