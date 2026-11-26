import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

export const periodCloseChecklistNotes = pgTable(
  "period_close_checklist_notes",
  {
    organizationId: text("organization_id").notNull(),
    fiscalYear: integer("fiscal_year").notNull(),
    periodNumber: integer("period_number").notNull(),
    itemCode: text("item_code").notNull(),
    note: text("note").notNull(),
    reason: text("reason").notNull(),
    notedBy: text("noted_by").notNull(),
    correlationId: text("correlation_id").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "period_close_checklist_notes_pk",
      columns: [table.organizationId, table.fiscalYear, table.periodNumber, table.itemCode],
    }),
    check(
      "period_close_checklist_notes_item_check",
      sql`${table.itemCode} in ('unlinked_funding','payment_evidence_gaps','ap_tied','tax_finalization','bank_reconciled','owner_custody_non_negative')`,
    ),
    check("period_close_checklist_notes_note_not_blank", sql`btrim(${table.note}) <> ''`),
    check("period_close_checklist_notes_reason_not_blank", sql`btrim(${table.reason}) <> ''`),
  ],
);

export const ownerCustodyCashCounts = pgTable(
  "owner_custody_cash_counts",
  {
    organizationId: text("organization_id").notNull(),
    id: text("id").notNull(),
    countedOn: date("counted_on").notNull(),
    custodyAccountCode: text("custody_account_code").notNull(),
    bookBalanceMinor: bigint("book_balance_minor", { mode: "bigint" }).notNull(),
    countedBalanceMinor: bigint("counted_balance_minor", { mode: "bigint" }).notNull(),
    differenceMinor: bigint("difference_minor", { mode: "bigint" }).notNull(),
    adjustmentAccountCode: text("adjustment_account_code"),
    journalId: text("journal_id"),
    currency: text("currency").notNull(),
    reason: text("reason").notNull(),
    note: text("note"),
    countedBy: text("counted_by").notNull(),
    correlationId: text("correlation_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "owner_custody_cash_counts_pk",
      columns: [table.organizationId, table.id],
    }),
    unique("owner_custody_cash_counts_journal_unique").on(table.organizationId, table.journalId),
    index("owner_custody_cash_counts_org_date_idx").on(
      table.organizationId,
      table.countedOn,
      table.createdAt,
      table.id,
    ),
    check("owner_custody_cash_counts_counted_non_negative", sql`${table.countedBalanceMinor} >= 0`),
    check(
      "owner_custody_cash_counts_difference_exact",
      sql`${table.countedBalanceMinor} - ${table.bookBalanceMinor} = ${table.differenceMinor}`,
    ),
    check("owner_custody_cash_counts_currency_iso3", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check("owner_custody_cash_counts_reason_not_blank", sql`btrim(${table.reason}) <> ''`),
  ],
);

export const ownerYearEndSettlements = pgTable(
  "owner_year_end_settlements",
  {
    organizationId: text("organization_id").notNull(),
    id: text("id").notNull(),
    fiscalYear: integer("fiscal_year").notNull(),
    effectiveOn: date("effective_on").notNull(),
    settlementOption: text("settlement_option").notNull(),
    repaymentDirection: text("repayment_direction"),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull(),
    debitAccountCode: text("debit_account_code").notNull(),
    creditAccountCode: text("credit_account_code").notNull(),
    financialAccountId: text("financial_account_id"),
    bankTransactionId: text("bank_transaction_id"),
    journalId: text("journal_id").notNull(),
    beforePayable3388Minor: bigint("before_payable_3388_minor", { mode: "bigint" }).notNull(),
    beforeReceivable1388Minor: bigint("before_receivable_1388_minor", { mode: "bigint" }).notNull(),
    beforeCustody111Minor: bigint("before_custody_111_minor", { mode: "bigint" }).notNull(),
    afterPayable3388Minor: bigint("after_payable_3388_minor", { mode: "bigint" }).notNull(),
    afterReceivable1388Minor: bigint("after_receivable_1388_minor", { mode: "bigint" }).notNull(),
    afterCustody111Minor: bigint("after_custody_111_minor", { mode: "bigint" }).notNull(),
    reference: text("reference"),
    description: text("description").notNull(),
    reason: text("reason").notNull(),
    createdBy: text("created_by").notNull(),
    correlationId: text("correlation_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "owner_year_end_settlements_pk",
      columns: [table.organizationId, table.id],
    }),
    unique("owner_year_end_settlements_journal_unique").on(table.organizationId, table.journalId),
    index("owner_year_end_settlements_org_year_idx").on(
      table.organizationId,
      table.fiscalYear,
      table.effectiveOn,
      table.id,
    ),
    check(
      "owner_year_end_settlements_option_check",
      sql`${table.settlementOption} in ('repayment','offset_3388_1388','profit_distribution')`,
    ),
    check("owner_year_end_settlements_amount_positive", sql`${table.amountMinor} > 0`),
    check("owner_year_end_settlements_currency_iso3", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check(
      "owner_year_end_settlements_description_not_blank",
      sql`btrim(${table.description}) <> ''`,
    ),
    check("owner_year_end_settlements_reason_not_blank", sql`btrim(${table.reason}) <> ''`),
  ],
);
