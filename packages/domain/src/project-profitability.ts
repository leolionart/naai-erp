export type ProjectProfitabilityConfidenceCode =
  "unbilled_work" | "overdue_ar" | "budget_overrun" | "missing_dimensions";

export type ProjectProfitabilityConfidenceFlag = Readonly<{
  code: ProjectProfitabilityConfidenceCode;
  severity: "warning" | "critical";
  amountMinor?: bigint;
  sourceIds: readonly string[];
}>;

export type ProjectProfitabilityDrilldown = Readonly<{
  recognitionEventIds: readonly string[];
  invoiceIds: readonly string[];
  reconciliationIds: readonly string[];
  expenseIds: readonly string[];
  purchaseDocumentIds: readonly string[];
  budgetVersionIds: readonly string[];
  journalIds: readonly string[];
}>;

export type ProjectProfitabilityInput = Readonly<{
  organizationId: string;
  projectId: string;
  clientId?: string;
  serviceLineCode?: string;
  accountOwnerId?: string;
  startsOn: string;
  endsOn: string;
  currency: string;
  recognizedRevenueMinor: bigint;
  invoicedRevenueMinor: bigint;
  collectedRevenueMinor: bigint;
  directProjectCostMinor: bigint;
  budgetCostMinor: bigint;
  unbilledWorkMinor: bigint;
  overdueArMinor: bigint;
  missingDimensionSourceIds: readonly string[];
  drilldown: ProjectProfitabilityDrilldown;
}>;

export type ProjectProfitability = ProjectProfitabilityInput &
  Readonly<{
    grossMarginMinor: bigint;
    grossMarginBps: number | null;
    overrunMinor: bigint;
    overrunBps: number | null;
    confidenceFlags: readonly ProjectProfitabilityConfidenceFlag[];
  }>;

const required = (value: string, label: string) => {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
};

const isoDate = (value: string, label: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`${label} must be an ISO date`);
  }
  return value;
};

const uniqueIds = (values: readonly string[], label: string) =>
  Object.freeze(
    [...new Set(values.map((value) => required(value, label)))].sort((a, b) => a.localeCompare(b)),
  );

function divideRounded(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n !== denominator < 0n;
  const absoluteNumerator = numerator < 0n ? -numerator : numerator;
  const absoluteDenominator = denominator < 0n ? -denominator : denominator;
  const rounded = (absoluteNumerator + absoluteDenominator / 2n) / absoluteDenominator;
  return negative ? -rounded : rounded;
}

export function profitabilityRatioBps(numerator: bigint, denominator: bigint): number | null {
  if (denominator === 0n) return null;
  const result = Number(divideRounded(numerator * 10_000n, denominator));
  if (!Number.isSafeInteger(result))
    throw new Error("Profitability ratio exceeds safe integer range");
  return result;
}

export function buildProjectProfitability(input: ProjectProfitabilityInput): ProjectProfitability {
  const organizationId = required(input.organizationId, "Profitability organization ID");
  const projectId = required(input.projectId, "Profitability project ID");
  const startsOn = isoDate(input.startsOn, "Profitability start date");
  const endsOn = isoDate(input.endsOn, "Profitability end date");
  if (endsOn < startsOn) throw new Error("Profitability end date cannot precede start date");
  if (
    [
      input.directProjectCostMinor,
      input.budgetCostMinor,
      input.unbilledWorkMinor,
      input.overdueArMinor,
    ].some((amount) => amount < 0n)
  ) {
    throw new Error("Profitability cost, budget and confidence amounts cannot be negative");
  }

  const drilldown = Object.freeze({
    recognitionEventIds: uniqueIds(input.drilldown.recognitionEventIds, "Recognition event ID"),
    invoiceIds: uniqueIds(input.drilldown.invoiceIds, "Invoice ID"),
    reconciliationIds: uniqueIds(input.drilldown.reconciliationIds, "Reconciliation ID"),
    expenseIds: uniqueIds(input.drilldown.expenseIds, "Expense ID"),
    purchaseDocumentIds: uniqueIds(input.drilldown.purchaseDocumentIds, "Purchase document ID"),
    budgetVersionIds: uniqueIds(input.drilldown.budgetVersionIds, "Budget version ID"),
    journalIds: uniqueIds(input.drilldown.journalIds, "Journal ID"),
  });
  const grossMarginMinor = input.recognizedRevenueMinor - input.directProjectCostMinor;
  const overrunMinor =
    input.directProjectCostMinor > input.budgetCostMinor
      ? input.directProjectCostMinor - input.budgetCostMinor
      : 0n;
  const flags: ProjectProfitabilityConfidenceFlag[] = [];
  if (input.unbilledWorkMinor > 0n)
    flags.push({
      code: "unbilled_work",
      severity: "warning",
      amountMinor: input.unbilledWorkMinor,
      sourceIds: drilldown.recognitionEventIds,
    });
  if (input.overdueArMinor > 0n)
    flags.push({
      code: "overdue_ar",
      severity: "warning",
      amountMinor: input.overdueArMinor,
      sourceIds: drilldown.invoiceIds,
    });
  if (overrunMinor > 0n)
    flags.push({
      code: "budget_overrun",
      severity: "critical",
      amountMinor: overrunMinor,
      sourceIds: drilldown.budgetVersionIds,
    });
  const missing = uniqueIds(input.missingDimensionSourceIds, "Missing-dimension source ID");
  if (missing.length)
    flags.push({ code: "missing_dimensions", severity: "critical", sourceIds: missing });

  return Object.freeze({
    ...input,
    organizationId,
    projectId,
    startsOn,
    endsOn,
    currency: required(input.currency, "Profitability currency").toUpperCase(),
    grossMarginMinor,
    grossMarginBps: profitabilityRatioBps(grossMarginMinor, input.recognizedRevenueMinor),
    overrunMinor,
    overrunBps: profitabilityRatioBps(overrunMinor, input.budgetCostMinor),
    confidenceFlags: Object.freeze(flags.map((flag) => Object.freeze(flag))),
    missingDimensionSourceIds: missing,
    drilldown,
  });
}
