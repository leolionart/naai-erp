ALTER TABLE "accounting_workflow_policies" ADD COLUMN "operating_mode" text DEFAULT 'controlled' NOT NULL;
--> statement-breakpoint
ALTER TABLE "accounting_workflow_policies" ADD CONSTRAINT "workflow_policy_operating_mode" CHECK ("operating_mode" in ('controlled', 'owner_final'));
--> statement-breakpoint
ALTER TABLE "commercial_document_lines" ADD COLUMN "management_state" "management_validity_state" DEFAULT 'unreviewed' NOT NULL;
--> statement-breakpoint
ALTER TABLE "commercial_document_lines" ADD COLUMN "cit_state" "eligibility_state" DEFAULT 'unreviewed' NOT NULL;
--> statement-breakpoint
ALTER TABLE "commercial_document_lines" ADD COLUMN "vat_state" "eligibility_state" DEFAULT 'unreviewed' NOT NULL;
--> statement-breakpoint
ALTER TABLE "commercial_document_lines" ADD COLUMN "cit_eligible_minor" bigint DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "commercial_document_lines" ADD COLUMN "vat_eligible_minor" bigint DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "commercial_document_lines" ADD COLUMN "reviewed_by" text;
--> statement-breakpoint
ALTER TABLE "commercial_document_lines" ADD COLUMN "reviewed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "commercial_document_lines" ADD COLUMN "review_reason" text;
--> statement-breakpoint
ALTER TABLE "commercial_document_lines" ADD COLUMN "review_reference" text;
--> statement-breakpoint
ALTER TABLE "commercial_document_lines" ADD CONSTRAINT "commercial_document_lines_eligible_limits" CHECK ("cit_eligible_minor" >= 0 and "cit_eligible_minor" <= "gross_minor" and "vat_eligible_minor" >= 0 and "vat_eligible_minor" <= "tax_minor");
--> statement-breakpoint
ALTER TABLE "commercial_document_lines" ADD CONSTRAINT "commercial_document_lines_review_metadata" CHECK (("reviewed_by" is null and "reviewed_at" is null and "review_reason" is null and "review_reference" is null) or ("reviewed_by" is not null and "reviewed_at" is not null and "review_reason" is not null and btrim("review_reason") <> ''));
