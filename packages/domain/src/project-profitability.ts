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
  directCostItemIds: readonly string[];
  overheadAllocationRunIds: readonly string[];
  overheadAllocationSplitIds: readonly string[];
  timesheetIds: readonly string[];
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
  variableOverheadMinor: bigint;
  fixedOverheadMinor: bigint;
  budgetCostMinor: bigint;
  unbilledWorkMinor: bigint;
  overdueArMinor: bigint;
  billableMinutes: number;
  projectMinutes: number;
  availableMinutes: number;
  missingDimensionSourceIds: readonly string[];
  drilldown: ProjectProfitabilityDrilldown;
}>;

export type ProjectProfitability = Readonly<{
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
  variableOverheadMinor: bigint;
  fixedOverheadMinor: bigint;
  fullyLoadedCostMinor: bigint;
  grossMarginMinor: bigint;
  grossMarginBps: number | null;
  contributionMarginMinor: bigint;
  contributionMarginBps: number | null;
  fullyLoadedProfitMinor: bigint;
  fullyLoadedMarginBps: number | null;
  realizedHourlyRateMinor: bigint | null;
  utilizationBps: number | null;
  budgetCostMinor: bigint;
  overrunMinor: bigint;
  overrunBps: number | null;
  unbilledWorkMinor: bigint;
  overdueArMinor: bigint;
  billableMinutes: number;
  projectMinutes: number;
  availableMinutes: number;
  confidenceFlags: readonly ProjectProfitabilityConfidenceFlag[];
  drilldown: ProjectProfitabilityDrilldown;
}>;

const required = (value: string, label: string): string => {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
};

function isoDate(value: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`${label} must be an ISO date`);
  }
  return value;
}

function currency(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) throw new Error("Profitability currency must be ISO-4217");
  return normalized;
}

function minutes(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function uniqueIds(values: readonly string[], label: string): readonly string[] {
  return Object.freeze(
    [...new Set(values.map((value) => required(value, label)))].sort((left, right) =>
      left.localeCompare(right),
    ),
  );
}

function divideRounded(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("Profitability denominator must be positive");
  const negative = numerator < 0n;
  const absolute = negative ? -numerator : numerator;
  const rounded = (absolute + denominator / 2n) / denominator;
  return negative ? -rounded : rounded;
}

export function profitabilityRatioBps(numerator: bigint, denominator: bigint): number | null {
  if (denominator === 0n) return null;
  const result =
    denominator < 0n
      ? divideRounded(-numerator * 10_000n, -denominator)
      : divideRounded(numerator * 10_000n, denominator);
  const numeric = Number(result);
  if (!Number.isSafeInteger(numeric))
    throw new Error("Profitability ratio exceeds safe integer range");
  return numeric;
}

function freezeDrilldown(input: ProjectProfitabilityDrilldown): ProjectProfitabilityDrilldown {
  return Object.freeze({
    recognitionEventIds: uniqueIds(input.recognitionEventIds, "Recognition event ID"),
    invoiceIds: uniqueIds(input.invoiceIds, "Invoice ID"),
    reconciliationIds: uniqueIds(input.reconciliationIds, "Reconciliation ID"),
    directCostItemIds: uniqueIds(input.directCostItemIds, "Direct cost item ID"),
    overheadAllocationRunIds: uniqueIds(
      input.overheadAllocationRunIds,
      "Overhead allocation run ID",
    ),
    overheadAllocationSplitIds: uniqueIds(
      input.overheadAllocationSplitIds,
      "Overhead allocation split ID",
    ),
    timesheetIds: uniqueIds(input.timesheetIds, "Timesheet ID"),
    budgetVersionIds: uniqueIds(input.budgetVersionIds, "Budget version ID"),
    journalIds: uniqueIds(input.journalIds, "Journal ID"),
  });
}

export function buildProjectProfitability(input: ProjectProfitabilityInput): ProjectProfitability {
  const organizationId = required(input.organizationId, "Profitability organization ID");
  const projectId = required(input.projectId, "Profitability project ID");
  const startsOn = isoDate(input.startsOn, "Profitability start date");
  const endsOn = isoDate(input.endsOn, "Profitability end date");
  if (endsOn < startsOn) throw new Error("Profitability end date cannot precede start date");
  const billableMinutes = minutes(input.billableMinutes, "Billable minutes");
  const projectMinutes = minutes(input.projectMinutes, "Project minutes");
  const availableMinutes = minutes(input.availableMinutes, "Available minutes");
  const nonNegativeAmounts = [
    input.directProjectCostMinor,
    input.variableOverheadMinor,
    input.fixedOverheadMinor,
    input.budgetCostMinor,
    input.unbilledWorkMinor,
    input.overdueArMinor,
  ];
  if (nonNegativeAmounts.some((amount) => amount < 0n)) {
    throw new Error("Profitability cost, budget and confidence amounts cannot be negative");
  }

  const fullyLoadedCostMinor =
    input.directProjectCostMinor + input.variableOverheadMinor + input.fixedOverheadMinor;
  const grossMarginMinor = input.recognizedRevenueMinor - input.directProjectCostMinor;
  const contributionMarginMinor = grossMarginMinor - input.variableOverheadMinor;
  const fullyLoadedProfitMinor = contributionMarginMinor - input.fixedOverheadMinor;
  const costVarianceMinor = fullyLoadedCostMinor - input.budgetCostMinor;
  const overrunMinor = costVarianceMinor > 0n ? costVarianceMinor : 0n;
  const missingDimensionSourceIds = uniqueIds(
    input.missingDimensionSourceIds,
    "Missing-dimension source ID",
  );
  const confidenceFlags: ProjectProfitabilityConfidenceFlag[] = [];
  if (input.unbilledWorkMinor > 0n) {
    confidenceFlags.push(
      Object.freeze({
        code: "unbilled_work",
        severity: "warning",
        amountMinor: input.unbilledWorkMinor,
        sourceIds: uniqueIds(input.drilldown.timesheetIds, "Timesheet ID"),
      }),
    );
  }
  if (input.overdueArMinor > 0n) {
    confidenceFlags.push(
      Object.freeze({
        code: "overdue_ar",
        severity: "warning",
        amountMinor: input.overdueArMinor,
        sourceIds: uniqueIds(input.drilldown.invoiceIds, "Invoice ID"),
      }),
    );
  }
  if (overrunMinor > 0n) {
    confidenceFlags.push(
      Object.freeze({
        code: "budget_overrun",
        severity: "critical",
        amountMinor: overrunMinor,
        sourceIds: uniqueIds(input.drilldown.budgetVersionIds, "Budget version ID"),
      }),
    );
  }
  if (missingDimensionSourceIds.length) {
    confidenceFlags.push(
      Object.freeze({
        code: "missing_dimensions",
        severity: "critical",
        sourceIds: missingDimensionSourceIds,
      }),
    );
  }

  return Object.freeze({
    organizationId,
    projectId,
    ...(input.clientId ? { clientId: required(input.clientId, "Profitability client ID") } : {}),
    ...(input.serviceLineCode
      ? { serviceLineCode: required(input.serviceLineCode, "Profitability service line") }
      : {}),
    ...(input.accountOwnerId
      ? { accountOwnerId: required(input.accountOwnerId, "Profitability account owner ID") }
      : {}),
    startsOn,
    endsOn,
    currency: currency(input.currency),
    recognizedRevenueMinor: input.recognizedRevenueMinor,
    invoicedRevenueMinor: input.invoicedRevenueMinor,
    collectedRevenueMinor: input.collectedRevenueMinor,
    directProjectCostMinor: input.directProjectCostMinor,
    variableOverheadMinor: input.variableOverheadMinor,
    fixedOverheadMinor: input.fixedOverheadMinor,
    fullyLoadedCostMinor,
    grossMarginMinor,
    grossMarginBps: profitabilityRatioBps(grossMarginMinor, input.recognizedRevenueMinor),
    contributionMarginMinor,
    contributionMarginBps: profitabilityRatioBps(
      contributionMarginMinor,
      input.recognizedRevenueMinor,
    ),
    fullyLoadedProfitMinor,
    fullyLoadedMarginBps: profitabilityRatioBps(
      fullyLoadedProfitMinor,
      input.recognizedRevenueMinor,
    ),
    realizedHourlyRateMinor:
      billableMinutes === 0
        ? null
        : divideRounded(input.recognizedRevenueMinor * 60n, BigInt(billableMinutes)),
    utilizationBps:
      availableMinutes === 0
        ? null
        : profitabilityRatioBps(BigInt(billableMinutes), BigInt(availableMinutes)),
    budgetCostMinor: input.budgetCostMinor,
    overrunMinor,
    overrunBps: profitabilityRatioBps(overrunMinor, input.budgetCostMinor),
    unbilledWorkMinor: input.unbilledWorkMinor,
    overdueArMinor: input.overdueArMinor,
    billableMinutes,
    projectMinutes,
    availableMinutes,
    confidenceFlags: Object.freeze(confidenceFlags),
    drilldown: freezeDrilldown(input.drilldown),
  });
}
