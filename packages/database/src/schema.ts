import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

const auditColumns = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const role = pgEnum("role", [
  "owner",
  "finance_admin",
  "accountant",
  "project_manager",
  "approver",
  "viewer",
  "integration",
]);

export const fiscalPeriodState = pgEnum("fiscal_period_state", [
  "open",
  "soft_locked",
  "hard_locked",
]);

export const organizations = pgTable(
  "organizations",
  {
    id: text("id").primaryKey(),
    legalName: text("legal_name").notNull(),
    baseCurrency: text("base_currency").notNull(),
    timezone: text("timezone").notNull(),
    ...auditColumns,
  },
  (table) => [
    check("organizations_legal_name_not_blank", sql`btrim(${table.legalName}) <> ''`),
    check("organizations_currency_iso3", sql`${table.baseCurrency} ~ '^[A-Z]{3}$'`),
    check("organizations_timezone_not_blank", sql`btrim(${table.timezone}) <> ''`),
  ],
);

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    ...auditColumns,
  },
  (table) => [
    unique("users_email_unique").on(table.email),
    check("users_email_not_blank", sql`btrim(${table.email}) <> ''`),
  ],
);

export const organizationMemberships = pgTable(
  "organization_memberships",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    ...auditColumns,
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.userId] }),
    unique("organization_memberships_org_user_unique").on(table.organizationId, table.userId),
  ],
);

export const membershipRoles = pgTable(
  "membership_roles",
  {
    organizationId: text("organization_id").notNull(),
    userId: text("user_id").notNull(),
    role: role("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.userId, table.role] }),
    foreignKey({
      columns: [table.organizationId, table.userId],
      foreignColumns: [organizationMemberships.organizationId, organizationMemberships.userId],
      name: "membership_roles_membership_fk",
    }).onDelete("cascade"),
  ],
);

export const fiscalYears = pgTable(
  "fiscal_years",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    year: integer("year").notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    ...auditColumns,
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.year] }),
    check("fiscal_years_year_range", sql`${table.year} between 1900 and 9999`),
    check("fiscal_years_date_order", sql`${table.startsOn} <= ${table.endsOn}`),
  ],
);

export const fiscalPeriods = pgTable(
  "fiscal_periods",
  {
    organizationId: text("organization_id").notNull(),
    fiscalYear: integer("fiscal_year").notNull(),
    periodNumber: integer("period_number").notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    state: fiscalPeriodState("state").notNull().default("open"),
    ...auditColumns,
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.fiscalYear, table.periodNumber] }),
    foreignKey({
      columns: [table.organizationId, table.fiscalYear],
      foreignColumns: [fiscalYears.organizationId, fiscalYears.year],
      name: "fiscal_periods_fiscal_year_fk",
    }).onDelete("restrict"),
    check("fiscal_periods_number_range", sql`${table.periodNumber} between 1 and 53`),
    check("fiscal_periods_date_order", sql`${table.startsOn} <= ${table.endsOn}`),
  ],
);

export const exchangeRates = pgTable(
  "exchange_rates",
  {
    id: text("id").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    sourceCurrency: text("source_currency").notNull(),
    targetCurrency: text("target_currency").notNull(),
    rate: numeric("rate", { precision: 38, scale: 18 }).notNull(),
    source: text("source").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    unique("exchange_rates_observation_unique").on(
      table.organizationId,
      table.sourceCurrency,
      table.targetCurrency,
      table.source,
      table.observedAt,
    ),
    check("exchange_rates_source_currency_iso3", sql`${table.sourceCurrency} ~ '^[A-Z]{3}$'`),
    check("exchange_rates_target_currency_iso3", sql`${table.targetCurrency} ~ '^[A-Z]{3}$'`),
    check(
      "exchange_rates_different_currencies",
      sql`${table.sourceCurrency} <> ${table.targetCurrency}`,
    ),
    check("exchange_rates_positive", sql`${table.rate} > 0`),
    check("exchange_rates_source_not_blank", sql`btrim(${table.source}) <> ''`),
  ],
);

export const schema = {
  organizations,
  users,
  organizationMemberships,
  membershipRoles,
  fiscalYears,
  fiscalPeriods,
  exchangeRates,
} as const;
