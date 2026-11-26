-- ERP-987 (BR-CLOSE-001): Monthly close checklist notes, owner-custody cash counts
-- (kiểm quỹ 111-OWNER-CUSTODY), cash over/short accounts, and year-end owner settlement.

INSERT INTO accounts (organization_id, code, name, root_type, is_control_account, allow_manual_posting, is_active)
SELECT o.id, v.code, v.name, v.root_type::account_root_type, false, true, true
FROM organizations o
CROSS JOIN (VALUES
  ('711-CASH-OVER', 'Thu nhập khác - Thừa quỹ kiểm kê', 'revenue'),
  ('811-CASH-SHORT', 'Chi phí khác - Thiếu quỹ kiểm kê', 'expense'),
  ('421', 'Lợi nhuận sau thuế chưa phân phối', 'equity')
) AS v(code, name, root_type)
ON CONFLICT (organization_id, code) DO NOTHING;
--> statement-breakpoint

DO $$
DECLARE
  mv record;
  next_line integer;
BEGIN
  FOR mv IN
    SELECT organization_id, id, version
    FROM financial_statement_mapping_versions
    WHERE EXISTS (
      SELECT 1 FROM financial_statement_mapping_lines l
      WHERE l.organization_id = financial_statement_mapping_versions.organization_id
        AND l.mapping_id = financial_statement_mapping_versions.id
        AND l.mapping_version = financial_statement_mapping_versions.version
    )
  LOOP
    SELECT coalesce(max(line_number), 0) + 1 INTO next_line
    FROM financial_statement_mapping_lines
    WHERE organization_id = mv.organization_id AND mapping_id = mv.id AND mapping_version = mv.version;

    IF EXISTS (SELECT 1 FROM accounts WHERE organization_id = mv.organization_id AND code = '711-CASH-OVER')
       AND NOT EXISTS (
         SELECT 1 FROM financial_statement_mapping_lines
         WHERE organization_id = mv.organization_id AND mapping_id = mv.id AND mapping_version = mv.version
           AND statement = 'profit_and_loss' AND account_code = '711-CASH-OVER'
       ) THEN
      INSERT INTO financial_statement_mapping_lines
        (organization_id, mapping_id, mapping_version, line_number, statement, line_code, label, account_code, display_order, sign)
      VALUES
        (mv.organization_id, mv.id, mv.version, next_line, 'profit_and_loss', 'other_income', 'Thu nhập khác - Thừa quỹ', '711-CASH-OVER', 45, 1)
      ON CONFLICT DO NOTHING;
      next_line := next_line + 1;
    END IF;

    IF EXISTS (SELECT 1 FROM accounts WHERE organization_id = mv.organization_id AND code = '811-CASH-SHORT')
       AND NOT EXISTS (
         SELECT 1 FROM financial_statement_mapping_lines
         WHERE organization_id = mv.organization_id AND mapping_id = mv.id AND mapping_version = mv.version
           AND statement = 'profit_and_loss' AND account_code = '811-CASH-SHORT'
       ) THEN
      INSERT INTO financial_statement_mapping_lines
        (organization_id, mapping_id, mapping_version, line_number, statement, line_code, label, account_code, display_order, sign)
      VALUES
        (mv.organization_id, mv.id, mv.version, next_line, 'profit_and_loss', 'other_expense', 'Chi phí khác - Thiếu quỹ', '811-CASH-SHORT', 55, 1)
      ON CONFLICT DO NOTHING;
      next_line := next_line + 1;
    END IF;

    IF EXISTS (SELECT 1 FROM accounts WHERE organization_id = mv.organization_id AND code = '421')
       AND NOT EXISTS (
         SELECT 1 FROM financial_statement_mapping_lines
         WHERE organization_id = mv.organization_id AND mapping_id = mv.id AND mapping_version = mv.version
           AND statement = 'balance_sheet' AND account_code = '421'
       ) THEN
      INSERT INTO financial_statement_mapping_lines
        (organization_id, mapping_id, mapping_version, line_number, statement, line_code, label, account_code, display_order, sign)
      VALUES
        (mv.organization_id, mv.id, mv.version, next_line, 'balance_sheet', 'retained_earnings', 'Lợi nhuận chưa phân phối', '421', 91, 1)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "period_close_checklist_notes" (
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE NO ACTION,
  "fiscal_year" integer NOT NULL,
  "period_number" integer NOT NULL,
  "item_code" text NOT NULL,
  "note" text NOT NULL,
  "reason" text NOT NULL,
  "noted_by" text NOT NULL,
  "correlation_id" text NOT NULL,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "period_close_checklist_notes_pk" PRIMARY KEY ("organization_id", "fiscal_year", "period_number", "item_code"),
  CONSTRAINT "period_close_checklist_notes_period_fk" FOREIGN KEY ("organization_id", "fiscal_year", "period_number")
    REFERENCES "fiscal_periods" ("organization_id", "fiscal_year", "period_number") ON DELETE CASCADE,
  CONSTRAINT "period_close_checklist_notes_item_check" CHECK (
    "item_code" IN (
      'unlinked_funding',
      'payment_evidence_gaps',
      'ap_tied',
      'tax_finalization',
      'bank_reconciled',
      'owner_custody_non_negative'
    )
  ),
  CONSTRAINT "period_close_checklist_notes_note_not_blank" CHECK (btrim("note") <> ''),
  CONSTRAINT "period_close_checklist_notes_reason_not_blank" CHECK (btrim("reason") <> '')
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "owner_custody_cash_counts" (
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE NO ACTION,
  "id" text NOT NULL,
  "counted_on" date NOT NULL,
  "custody_account_code" text NOT NULL,
  "book_balance_minor" bigint NOT NULL,
  "counted_balance_minor" bigint NOT NULL,
  "difference_minor" bigint NOT NULL,
  "adjustment_account_code" text,
  "journal_id" text,
  "currency" text NOT NULL,
  "reason" text NOT NULL,
  "note" text,
  "counted_by" text NOT NULL,
  "correlation_id" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "owner_custody_cash_counts_pk" PRIMARY KEY ("organization_id", "id"),
  CONSTRAINT "owner_custody_cash_counts_journal_unique" UNIQUE ("organization_id", "journal_id"),
  CONSTRAINT "owner_custody_cash_counts_counted_non_negative" CHECK ("counted_balance_minor" >= 0),
  CONSTRAINT "owner_custody_cash_counts_difference_exact" CHECK (
    "counted_balance_minor" - "book_balance_minor" = "difference_minor"
  ),
  CONSTRAINT "owner_custody_cash_counts_adjustment_consistency" CHECK (
    ("difference_minor" = 0 AND "journal_id" IS NULL AND "adjustment_account_code" IS NULL)
    OR ("difference_minor" <> 0 AND "journal_id" IS NOT NULL AND "adjustment_account_code" IS NOT NULL)
  ),
  CONSTRAINT "owner_custody_cash_counts_currency_iso3" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "owner_custody_cash_counts_reason_not_blank" CHECK (btrim("reason") <> ''),
  CONSTRAINT "owner_custody_cash_counts_custody_account_fk" FOREIGN KEY ("organization_id", "custody_account_code")
    REFERENCES "accounts" ("organization_id", "code") ON DELETE RESTRICT,
  CONSTRAINT "owner_custody_cash_counts_adjustment_account_fk" FOREIGN KEY ("organization_id", "adjustment_account_code")
    REFERENCES "accounts" ("organization_id", "code") ON DELETE RESTRICT,
  CONSTRAINT "owner_custody_cash_counts_journal_fk" FOREIGN KEY ("organization_id", "journal_id")
    REFERENCES "journal_entries" ("organization_id", "id") ON DELETE RESTRICT
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "owner_custody_cash_counts_org_date_idx"
  ON "owner_custody_cash_counts" ("organization_id", "counted_on" DESC, "created_at" DESC, "id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "owner_year_end_settlements" (
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE NO ACTION,
  "id" text NOT NULL,
  "fiscal_year" integer NOT NULL,
  "effective_on" date NOT NULL,
  "settlement_option" text NOT NULL,
  "repayment_direction" text,
  "amount_minor" bigint NOT NULL,
  "currency" text NOT NULL,
  "debit_account_code" text NOT NULL,
  "credit_account_code" text NOT NULL,
  "financial_account_id" text,
  "bank_transaction_id" text,
  "journal_id" text NOT NULL,
  "before_payable_3388_minor" bigint NOT NULL,
  "before_receivable_1388_minor" bigint NOT NULL,
  "before_custody_111_minor" bigint NOT NULL,
  "after_payable_3388_minor" bigint NOT NULL,
  "after_receivable_1388_minor" bigint NOT NULL,
  "after_custody_111_minor" bigint NOT NULL,
  "reference" text,
  "description" text NOT NULL,
  "reason" text NOT NULL,
  "created_by" text NOT NULL,
  "correlation_id" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "owner_year_end_settlements_pk" PRIMARY KEY ("organization_id", "id"),
  CONSTRAINT "owner_year_end_settlements_journal_unique" UNIQUE ("organization_id", "journal_id"),
  CONSTRAINT "owner_year_end_settlements_option_check" CHECK (
    "settlement_option" IN ('repayment', 'offset_3388_1388', 'profit_distribution')
  ),
  CONSTRAINT "owner_year_end_settlements_repayment_check" CHECK (
    ("settlement_option" = 'repayment' AND "repayment_direction" IN ('company_to_owner', 'owner_to_company') AND "financial_account_id" IS NOT NULL)
    OR ("settlement_option" <> 'repayment' AND "repayment_direction" IS NULL AND "financial_account_id" IS NULL)
  ),
  CONSTRAINT "owner_year_end_settlements_amount_positive" CHECK ("amount_minor" > 0),
  CONSTRAINT "owner_year_end_settlements_currency_iso3" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "owner_year_end_settlements_description_not_blank" CHECK (btrim("description") <> ''),
  CONSTRAINT "owner_year_end_settlements_reason_not_blank" CHECK (btrim("reason") <> ''),
  CONSTRAINT "owner_year_end_settlements_year_fk" FOREIGN KEY ("organization_id", "fiscal_year")
    REFERENCES "fiscal_years" ("organization_id", "year") ON DELETE RESTRICT,
  CONSTRAINT "owner_year_end_settlements_debit_account_fk" FOREIGN KEY ("organization_id", "debit_account_code")
    REFERENCES "accounts" ("organization_id", "code") ON DELETE RESTRICT,
  CONSTRAINT "owner_year_end_settlements_credit_account_fk" FOREIGN KEY ("organization_id", "credit_account_code")
    REFERENCES "accounts" ("organization_id", "code") ON DELETE RESTRICT,
  CONSTRAINT "owner_year_end_settlements_financial_account_fk" FOREIGN KEY ("organization_id", "financial_account_id")
    REFERENCES "financial_accounts" ("organization_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "owner_year_end_settlements_bank_tx_fk" FOREIGN KEY ("organization_id", "bank_transaction_id")
    REFERENCES "bank_transactions" ("organization_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "owner_year_end_settlements_journal_fk" FOREIGN KEY ("organization_id", "journal_id")
    REFERENCES "journal_entries" ("organization_id", "id") ON DELETE RESTRICT
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "owner_year_end_settlements_org_year_idx"
  ON "owner_year_end_settlements" ("organization_id", "fiscal_year" DESC, "effective_on" DESC, "id");
