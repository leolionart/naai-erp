-- ERP-983 (BR-PAY-004): Canonical owner funding deposits into company bank accounts,
-- owner repayments from company bank accounts, and optional expense/invoice traceability.

CREATE TABLE IF NOT EXISTS "owner_funding_movements" (
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE NO ACTION,
  "id" text NOT NULL,
  "movement_type" text NOT NULL,
  "entry_mode" text NOT NULL,
  "financial_account_id" text NOT NULL,
  "bank_transaction_id" text NOT NULL,
  "journal_id" text NOT NULL,
  "booking_date" date NOT NULL,
  "amount_minor" bigint NOT NULL,
  "currency" text NOT NULL,
  "reference" text,
  "description" text NOT NULL,
  "reason" text NOT NULL,
  "created_by" text NOT NULL,
  "correlation_id" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "owner_funding_movements_pk" PRIMARY KEY ("organization_id", "id"),
  CONSTRAINT "owner_funding_movements_transaction_unique" UNIQUE ("organization_id", "bank_transaction_id"),
  CONSTRAINT "owner_funding_movements_journal_unique" UNIQUE ("organization_id", "journal_id"),
  CONSTRAINT "owner_funding_movements_type_check" CHECK ("movement_type" IN ('owner_funding', 'owner_repayment')),
  CONSTRAINT "owner_funding_movements_entry_mode_check" CHECK ("entry_mode" IN ('bank_transaction', 'manual')),
  CONSTRAINT "owner_funding_movements_amount_positive" CHECK ("amount_minor" > 0),
  CONSTRAINT "owner_funding_movements_currency_iso3" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "owner_funding_movements_manual_reference_check" CHECK (
    "entry_mode" = 'bank_transaction' OR ("reference" IS NOT NULL AND btrim("reference") <> '')
  ),
  CONSTRAINT "owner_funding_movements_description_not_blank" CHECK (btrim("description") <> ''),
  CONSTRAINT "owner_funding_movements_reason_not_blank" CHECK (btrim("reason") <> ''),
  CONSTRAINT "owner_funding_movements_account_fk" FOREIGN KEY ("organization_id", "financial_account_id")
    REFERENCES "financial_accounts" ("organization_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "owner_funding_movements_transaction_fk" FOREIGN KEY ("organization_id", "bank_transaction_id")
    REFERENCES "bank_transactions" ("organization_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "owner_funding_movements_journal_fk" FOREIGN KEY ("organization_id", "journal_id")
    REFERENCES "journal_entries" ("organization_id", "id") ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "owner_funding_movements_org_date_idx"
  ON "owner_funding_movements" ("organization_id", "movement_type", "booking_date" DESC, "id");
--> statement-breakpoint
ALTER TABLE "expenses"
  ADD COLUMN IF NOT EXISTS "owner_funding_movement_id" text;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_owner_funding_movement_fk') THEN
    ALTER TABLE "expenses"
      ADD CONSTRAINT "expenses_owner_funding_movement_fk"
      FOREIGN KEY ("organization_id", "owner_funding_movement_id")
      REFERENCES "owner_funding_movements" ("organization_id", "id")
      ON DELETE RESTRICT;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expenses_owner_funding_movement_idx"
  ON "expenses" ("organization_id", "owner_funding_movement_id")
  WHERE "owner_funding_movement_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "commercial_documents"
  ADD COLUMN IF NOT EXISTS "owner_funding_movement_id" text;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'commercial_documents_owner_funding_movement_fk') THEN
    ALTER TABLE "commercial_documents"
      ADD CONSTRAINT "commercial_documents_owner_funding_movement_fk"
      FOREIGN KEY ("organization_id", "owner_funding_movement_id")
      REFERENCES "owner_funding_movements" ("organization_id", "id")
      ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'commercial_documents_owner_funding_purchase') THEN
    ALTER TABLE "commercial_documents"
      ADD CONSTRAINT "commercial_documents_owner_funding_purchase"
      CHECK ("type" = 'purchase_invoice' OR "owner_funding_movement_id" IS NULL);
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "commercial_documents_owner_funding_movement_idx"
  ON "commercial_documents" ("organization_id", "owner_funding_movement_id")
  WHERE "owner_funding_movement_id" IS NOT NULL;
