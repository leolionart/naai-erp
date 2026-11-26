import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { organizations } from "./schema.js";

export const statutoryCitRateTiers = pgTable(
  "statutory_cit_rate_tiers",
  {
    effectiveFromYear: integer("effective_from_year").notNull(),
    effectiveToYear: integer("effective_to_year"),
    tierOrder: integer("tier_order").notNull(),
    tierCode: text("tier_code").notNull(),
    label: text("label").notNull(),
    maxRevenueMinor: bigint("max_revenue_minor", { mode: "bigint" }),
    rateBps: integer("rate_bps").notNull(),
    lawReference: text("law_reference").notNull().default("Law 67/2025/QH15"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.effectiveFromYear, table.tierOrder] }),
    check(
      "statutory_cit_rate_tiers_year_range",
      sql`${table.effectiveToYear} is null or ${table.effectiveToYear} >= ${table.effectiveFromYear}`,
    ),
    check("statutory_cit_rate_tiers_rate_bps", sql`${table.rateBps} between 0 and 10000`),
  ],
);

export const organizationCitPolicies = pgTable(
  "organization_cit_policies",
  {
    organizationId: text("organization_id")
      .primaryKey()
      .references(() => organizations.id, { onDelete: "cascade" }),
    citSmallEnterpriseIneligible: boolean("cit_small_enterprise_ineligible")
      .notNull()
      .default(false),
    ineligibilityReason: text("ineligibility_reason"),
    priorYearRevenueOverrideMinor: bigint("prior_year_revenue_override_minor", {
      mode: "bigint",
    }),
    updatedBy: text("updated_by").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    version: bigint("version", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
  },
  (table) => [
    check(
      "organization_cit_policies_override_nonnegative",
      sql`${table.priorYearRevenueOverrideMinor} is null or ${table.priorYearRevenueOverrideMinor} >= 0`,
    ),
  ],
);

export const organizationCitRateTiers = pgTable(
  "organization_cit_rate_tiers",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    effectiveFromYear: integer("effective_from_year").notNull(),
    effectiveToYear: integer("effective_to_year"),
    tierOrder: integer("tier_order").notNull(),
    tierCode: text("tier_code").notNull(),
    label: text("label").notNull(),
    maxRevenueMinor: bigint("max_revenue_minor", { mode: "bigint" }),
    rateBps: integer("rate_bps").notNull(),
    lawReference: text("law_reference").notNull().default("Law 67/2025/QH15"),
    updatedBy: text("updated_by").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    version: bigint("version", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
  },
  (table) => [
    primaryKey({
      columns: [table.organizationId, table.effectiveFromYear, table.tierOrder],
    }),
    index("organization_cit_rate_tiers_lookup_idx").on(
      table.organizationId,
      table.effectiveFromYear,
      table.tierOrder,
    ),
  ],
);
