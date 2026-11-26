import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  type PgColumn,
} from "drizzle-orm/pg-core";

type OwnerFundingSchemaDeps = Readonly<{
  organizations: { id: PgColumn };
  financialAccounts: { organizationId: PgColumn; id: PgColumn };
  bankTransactions: { organizationId: PgColumn; id: PgColumn };
  journalEntries: { organizationId: PgColumn; id: PgColumn };
}>;

export function buildOwnerFundingTables(deps: OwnerFundingSchemaDeps) {
  const ownerCashWithdrawals = pgTable(
    "owner_cash_withdrawals",
    {
      organizationId: text("organization_id")
        .notNull()
        .references(() => deps.organizations.id),
      id: text("id").notNull(),
      bankTransactionId: text("bank_transaction_id").notNull(),
      journalId: text("journal_id").notNull(),
      movementType: text("movement_type").notNull().default("owner_personal_withdrawal"),
      reason: text("reason").notNull(),
      createdBy: text("created_by").notNull(),
      correlationId: text("correlation_id").notNull(),
      createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
      primaryKey({ columns: [table.organizationId, table.id] }),
      unique("owner_cash_withdrawals_transaction_unique").on(
        table.organizationId,
        table.bankTransactionId,
      ),
      unique("owner_cash_withdrawals_journal_unique").on(table.organizationId, table.journalId),
      foreignKey({
        columns: [table.organizationId, table.bankTransactionId],
        foreignColumns: [deps.bankTransactions.organizationId, deps.bankTransactions.id],
        name: "owner_cash_withdrawals_transaction_fk",
      }).onDelete("restrict"),
      foreignKey({
        columns: [table.organizationId, table.journalId],
        foreignColumns: [deps.journalEntries.organizationId, deps.journalEntries.id],
        name: "owner_cash_withdrawals_journal_fk",
      }).onDelete("restrict"),
      check(
        "owner_cash_withdrawals_movement_type",
        sql`${table.movementType} = 'owner_personal_withdrawal'`,
      ),
      check("owner_cash_withdrawals_reason", sql`btrim(${table.reason}) <> ''`),
    ],
  );

  const ownerFundingMovements = pgTable(
    "owner_funding_movements",
    {
      organizationId: text("organization_id")
        .notNull()
        .references(() => deps.organizations.id),
      id: text("id").notNull(),
      movementType: text("movement_type").notNull(),
      entryMode: text("entry_mode").notNull(),
      financialAccountId: text("financial_account_id").notNull(),
      bankTransactionId: text("bank_transaction_id").notNull(),
      journalId: text("journal_id").notNull(),
      bookingDate: date("booking_date").notNull(),
      amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
      currency: text("currency").notNull(),
      reference: text("reference"),
      description: text("description").notNull(),
      reason: text("reason").notNull(),
      createdBy: text("created_by").notNull(),
      correlationId: text("correlation_id").notNull(),
      createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
      primaryKey({ name: "owner_funding_movements_pk", columns: [table.organizationId, table.id] }),
      unique("owner_funding_movements_transaction_unique").on(
        table.organizationId,
        table.bankTransactionId,
      ),
      unique("owner_funding_movements_journal_unique").on(table.organizationId, table.journalId),
      index("owner_funding_movements_org_date_idx").on(
        table.organizationId,
        table.movementType,
        table.bookingDate,
        table.id,
      ),
      foreignKey({
        columns: [table.organizationId, table.financialAccountId],
        foreignColumns: [deps.financialAccounts.organizationId, deps.financialAccounts.id],
        name: "owner_funding_movements_account_fk",
      }).onDelete("restrict"),
      foreignKey({
        columns: [table.organizationId, table.bankTransactionId],
        foreignColumns: [deps.bankTransactions.organizationId, deps.bankTransactions.id],
        name: "owner_funding_movements_transaction_fk",
      }).onDelete("restrict"),
      foreignKey({
        columns: [table.organizationId, table.journalId],
        foreignColumns: [deps.journalEntries.organizationId, deps.journalEntries.id],
        name: "owner_funding_movements_journal_fk",
      }).onDelete("restrict"),
      check(
        "owner_funding_movements_type_check",
        sql`${table.movementType} in ('owner_funding', 'owner_repayment')`,
      ),
      check(
        "owner_funding_movements_entry_mode_check",
        sql`${table.entryMode} in ('bank_transaction', 'manual')`,
      ),
      check("owner_funding_movements_amount_positive", sql`${table.amountMinor} > 0`),
      check("owner_funding_movements_currency_iso3", sql`${table.currency} ~ '^[A-Z]{3}$'`),
      check(
        "owner_funding_movements_manual_reference_check",
        sql`${table.entryMode} = 'bank_transaction' or (${table.reference} is not null and btrim(${table.reference}) <> '')`,
      ),
      check(
        "owner_funding_movements_description_not_blank",
        sql`btrim(${table.description}) <> ''`,
      ),
      check("owner_funding_movements_reason_not_blank", sql`btrim(${table.reason}) <> ''`),
    ],
  );

  return { ownerCashWithdrawals, ownerFundingMovements };
}
