import type { ActualBasis, PlanningDimensions, PlanningVersionState } from "./planning.js";

export const FORECAST_COMPONENT_SECTIONS = ["revenue", "expense", "cash"] as const;
export type ForecastComponentSection = (typeof FORECAST_COMPONENT_SECTIONS)[number];

export const FORECAST_COMPONENT_KINDS = [
  "committed_milestone",
  "scheduled_recurring",
  "weighted_pipeline",
  "manual_adjustment",
  "payroll",
  "recurring_opex",
  "opening_cash",
  "expected_collection",
  "financing",
  "ap_due",
  "recurring_expense",
  "tax",
  "capex",
] as const;
export type ForecastComponentKind = (typeof FORECAST_COMPONENT_KINDS)[number];
export type ForecastComponentDirection = "increase" | "decrease";
export type ForecastComponentState = "active" | "excluded";
export type ForecastComponentReviewState = "not_required" | "pending" | "reviewed";

export const FORECAST_SOURCE_TYPES = [
  "milestone",
  "recurring_schedule",
  "opportunity",
  "manual",
  "bank_balance",
  "receivable",
  "financing",
  "owner_funding",
  "payroll_schedule",
  "payable",
  "tax_schedule",
  "capex_schedule",
] as const;
export type ForecastSourceType = (typeof FORECAST_SOURCE_TYPES)[number];

export type ForecastSourceIdentity = Readonly<{
  type: ForecastSourceType;
  id: string;
  commercialRootType?: string;
  commercialRootId?: string;
}>;

export type ForecastSourceSnapshot = Readonly<Record<string, string | number | boolean | null>>;

export type ForecastCompositionContext = Readonly<{
  organizationId: string;
  forecastVersionId: string;
  forecastState: PlanningVersionState;
  actualBasis: ActualBasis;
  asOfDate: string;
  startsOn: string;
  endsOn: string;
  currency: string;
  dimensions?: PlanningDimensions;
}>;

export type ForecastComponent = Readonly<{
  organizationId: string;
  forecastVersionId: string;
  id: string;
  section: ForecastComponentSection;
  kind: ForecastComponentKind;
  direction: ForecastComponentDirection;
  scheduledOn: string;
  amountMinor: bigint;
  probabilityBps: number;
  currency: string;
  source: ForecastSourceIdentity;
  sourceSnapshot: ForecastSourceSnapshot;
  dimensions: PlanningDimensions;
  note?: string;
  createdBy: string;
  state: ForecastComponentState;
  reviewState: ForecastComponentReviewState;
  version: number;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewReason?: string;
  excludedBy?: string;
  excludedAt?: string;
  exclusionReason?: string;
}>;

export type ForecastComposition = Readonly<{
  organizationId: string;
  forecastVersionId: string;
  formulaVersion: "forecast-composition-v1";
  actualBasis: ActualBasis;
  asOfDate: string;
  startsOn: string;
  endsOn: string;
  currency: string;
  actualToDateMinor: bigint;
  committedMilestonesMinor: bigint;
  scheduledRecurringRevenueMinor: bigint;
  weightedPipelineMinor: bigint;
  manualRevenueAdjustmentMinor: bigint;
  projectedRevenueMinor: bigint;
  payrollExpenseMinor: bigint;
  recurringOpexMinor: bigint;
  manualExpenseAdjustmentMinor: bigint;
  projectedExpenseMinor: bigint;
  openingCashMinor: bigint;
  expectedCollectionsMinor: bigint;
  financingMinor: bigint;
  payrollCashOutMinor: bigint;
  apDueMinor: bigint;
  recurringExpenseCashOutMinor: bigint;
  taxCashOutMinor: bigint;
  capexCashOutMinor: bigint;
  manualCashAdjustmentMinor: bigint;
  projectedClosingCashMinor: bigint;
  componentIds: readonly string[];
  sourceIds: readonly string[];
}>;

const SECTION_KINDS: Readonly<
  Record<ForecastComponentSection, ReadonlySet<ForecastComponentKind>>
> = {
  revenue: new Set([
    "committed_milestone",
    "scheduled_recurring",
    "weighted_pipeline",
    "manual_adjustment",
  ]),
  expense: new Set(["payroll", "recurring_opex", "manual_adjustment"]),
  cash: new Set([
    "opening_cash",
    "expected_collection",
    "financing",
    "payroll",
    "ap_due",
    "recurring_expense",
    "tax",
    "capex",
    "manual_adjustment",
  ]),
};

function required(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function isoDate(value: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} must be an ISO date`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} must be an ISO date`);
  }
  return value;
}

function timestamp(value: string, label: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || !value.includes("T")) {
    throw new Error(`${label} must be an ISO timestamp`);
  }
  return value;
}

function currency(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new Error("Forecast component currency must be ISO-4217");
  }
  return normalized;
}

function dimensions(input?: PlanningDimensions): PlanningDimensions {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(input ?? {}).map(([key, value]) => [
        key,
        required(value, `Forecast component ${key}`),
      ]),
    ),
  );
}

function source(input: ForecastSourceIdentity): ForecastSourceIdentity {
  const type = input.type;
  const id = required(input.id, "Forecast source ID");
  const commercialRootType = input.commercialRootType?.trim();
  const commercialRootId = input.commercialRootId?.trim();
  if (Boolean(commercialRootType) !== Boolean(commercialRootId)) {
    throw new Error("Commercial source root type and ID must be provided together");
  }
  return Object.freeze({
    type,
    id,
    ...(commercialRootType && commercialRootId ? { commercialRootType, commercialRootId } : {}),
  });
}

export function assertForecastComponentMutable(state: PlanningVersionState): void {
  if (state !== "draft") {
    throw new Error("Published or superseded forecast composition is immutable");
  }
}

function assertKindMatrix(
  section: ForecastComponentSection,
  kind: ForecastComponentKind,
  direction: ForecastComponentDirection,
): void {
  if (!SECTION_KINDS[section].has(kind)) {
    throw new Error(`Forecast component kind ${kind} is invalid for ${section}`);
  }
  if (kind === "manual_adjustment") return;
  const cashOutflow =
    section === "cash" && ["payroll", "ap_due", "recurring_expense", "tax", "capex"].includes(kind);
  const expected = cashOutflow ? "decrease" : "increase";
  if (direction !== expected) {
    throw new Error(`Forecast component kind ${kind} must ${expected} its section`);
  }
}

export function createForecastComponent(
  context: ForecastCompositionContext,
  input: Readonly<{
    id: string;
    section: ForecastComponentSection;
    kind: ForecastComponentKind;
    direction: ForecastComponentDirection;
    scheduledOn: string;
    amountMinor: bigint;
    probabilityBps?: number;
    currency: string;
    source: ForecastSourceIdentity;
    sourceSnapshot?: ForecastSourceSnapshot;
    dimensions?: PlanningDimensions;
    note?: string;
    createdBy: string;
  }>,
): ForecastComponent {
  assertForecastComponentMutable(context.forecastState);
  const asOfDate = isoDate(context.asOfDate, "Forecast as-of date");
  const startsOn = isoDate(context.startsOn, "Forecast start date");
  const endsOn = isoDate(context.endsOn, "Forecast end date");
  const scheduledOn = isoDate(input.scheduledOn, "Forecast component date");
  if (startsOn > endsOn || asOfDate > endsOn) throw new Error("Forecast period is invalid");
  if (input.kind === "opening_cash") {
    if (scheduledOn !== asOfDate)
      throw new Error("Opening cash must be dated on forecast as-of date");
  } else if (scheduledOn <= asOfDate || scheduledOn < startsOn || scheduledOn > endsOn) {
    throw new Error("Forecast component must fall after as-of date and within forecast period");
  }
  assertKindMatrix(input.section, input.kind, input.direction);
  if (input.amountMinor < 0n) throw new Error("Forecast component amount cannot be negative");
  const probabilityBps = input.probabilityBps ?? 10_000;
  if (!Number.isSafeInteger(probabilityBps) || probabilityBps < 0 || probabilityBps > 10_000) {
    throw new Error("Forecast probability must be integer basis points from 0 to 10000");
  }
  if (input.kind !== "weighted_pipeline" && probabilityBps !== 10_000) {
    throw new Error("Only weighted pipeline may use probability below 10000 basis points");
  }
  const normalizedSource = source(input.source);
  if (input.kind === "manual_adjustment" && normalizedSource.type !== "manual") {
    throw new Error("Manual adjustment must use a manual source");
  }
  if (input.kind !== "manual_adjustment" && normalizedSource.type === "manual") {
    throw new Error("Source-backed forecast component cannot use a manual source");
  }
  if (
    input.section === "revenue" &&
    input.kind !== "manual_adjustment" &&
    (!normalizedSource.commercialRootType || !normalizedSource.commercialRootId)
  ) {
    throw new Error("Revenue source requires canonical commercial root identity");
  }
  if (
    normalizedSource.type === "owner_funding" &&
    !(input.section === "cash" && input.kind === "financing" && input.direction === "increase")
  ) {
    throw new Error("Owner funding must be classified as financing cash inflow");
  }
  const componentCurrency = currency(input.currency);
  if (componentCurrency !== currency(context.currency)) {
    throw new Error("Forecast component currency must match forecast currency");
  }
  return Object.freeze({
    organizationId: required(context.organizationId, "Forecast organization ID"),
    forecastVersionId: required(context.forecastVersionId, "Forecast version ID"),
    id: required(input.id, "Forecast component ID"),
    section: input.section,
    kind: input.kind,
    direction: input.direction,
    scheduledOn,
    amountMinor: input.amountMinor,
    probabilityBps,
    currency: componentCurrency,
    source: normalizedSource,
    sourceSnapshot: Object.freeze({ ...(input.sourceSnapshot ?? {}) }),
    dimensions: dimensions(input.dimensions ?? context.dimensions),
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    createdBy: required(input.createdBy, "Forecast component creator"),
    state: "active",
    reviewState: input.kind === "manual_adjustment" ? "pending" : "not_required",
    version: 1,
  });
}

export function reviewForecastManualAdjustment(
  component: ForecastComponent,
  actorId: string,
  reason: string,
  reviewedAt: string,
): ForecastComponent {
  if (component.kind !== "manual_adjustment") {
    throw new Error("Only manual forecast adjustments require review");
  }
  if (component.state !== "active" || component.reviewState !== "pending") {
    throw new Error("Only active pending manual adjustment can be reviewed");
  }
  if (component.createdBy === actorId.trim()) {
    throw new Error("Forecast manual adjustment requires maker-checker separation");
  }
  return Object.freeze({
    ...component,
    reviewState: "reviewed",
    reviewedBy: required(actorId, "Forecast adjustment reviewer"),
    reviewedAt: timestamp(reviewedAt, "Forecast adjustment review time"),
    reviewReason: required(reason, "Forecast adjustment review reason"),
    version: component.version + 1,
  });
}

export function excludeForecastComponent(
  component: ForecastComponent,
  actorId: string,
  reason: string,
  excludedAt: string,
): ForecastComponent {
  if (component.state !== "active") throw new Error("Forecast component is already excluded");
  return Object.freeze({
    ...component,
    state: "excluded",
    excludedBy: required(actorId, "Forecast component excluder"),
    excludedAt: timestamp(excludedAt, "Forecast component exclusion time"),
    exclusionReason: required(reason, "Forecast component exclusion reason"),
    version: component.version + 1,
  });
}

function deduplicationKey(component: ForecastComponent): string | undefined {
  if (component.state === "excluded" || component.source.type === "manual") return undefined;
  const identity =
    component.source.commercialRootType && component.source.commercialRootId
      ? `${component.source.commercialRootType}:${component.source.commercialRootId}`
      : `${component.source.type}:${component.source.id}`;
  return `${component.section}:${identity}:${component.scheduledOn}`;
}

export function assertNoForecastSourceDoubleCount(components: readonly ForecastComponent[]): void {
  const keys = new Map<string, string>();
  for (const component of components) {
    const key = deduplicationKey(component);
    if (!key) continue;
    const existing = keys.get(key);
    if (existing) {
      throw new Error(`Forecast source is double-counted by ${existing} and ${component.id}`);
    }
    keys.set(key, component.id);
  }
}

export function weightedForecastComponentMinor(component: ForecastComponent): bigint {
  const weighted = (component.amountMinor * BigInt(component.probabilityBps) + 5_000n) / 10_000n;
  return component.direction === "increase" ? weighted : -weighted;
}

export function assertForecastCompositionPublishable(
  components: readonly ForecastComponent[],
): void {
  assertNoForecastSourceDoubleCount(components);
  const pending = components.find(
    (component) =>
      component.state === "active" &&
      component.kind === "manual_adjustment" &&
      component.reviewState !== "reviewed",
  );
  if (pending) throw new Error(`Manual forecast adjustment ${pending.id} requires review`);
  const openingCashCount = components.filter(
    (component) =>
      component.state === "active" &&
      component.section === "cash" &&
      component.kind === "opening_cash",
  ).length;
  if (openingCashCount !== 1)
    throw new Error("Publishable forecast composition requires exactly one opening cash");
}

function total(
  components: readonly ForecastComponent[],
  section: ForecastComponentSection,
  kind: ForecastComponentKind,
): bigint {
  return components
    .filter(
      (component) =>
        component.state === "active" && component.section === section && component.kind === kind,
    )
    .reduce((sum, component) => sum + weightedForecastComponentMinor(component), 0n);
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort((left, right) => left.localeCompare(right)));
}

export function buildForecastComposition(
  input: Readonly<{
    context: ForecastCompositionContext;
    actualToDateMinor: bigint;
    components: readonly ForecastComponent[];
  }>,
): ForecastComposition {
  const { context } = input;
  const components = input.components.filter((component) => component.state === "active");
  if (
    components.some(
      (component) =>
        component.organizationId !== context.organizationId ||
        component.forecastVersionId !== context.forecastVersionId,
    )
  ) {
    throw new Error("Forecast composition components must share organization and version");
  }
  assertNoForecastSourceDoubleCount(components);
  const pending = components.find(
    (component) => component.kind === "manual_adjustment" && component.reviewState !== "reviewed",
  );
  if (pending) throw new Error(`Manual forecast adjustment ${pending.id} requires review`);
  const opening = components.filter(
    (component) => component.section === "cash" && component.kind === "opening_cash",
  );
  if (opening.length > 1)
    throw new Error("Forecast composition cannot have multiple opening cash lines");

  const committedMilestonesMinor = total(components, "revenue", "committed_milestone");
  const scheduledRecurringRevenueMinor = total(components, "revenue", "scheduled_recurring");
  const weightedPipelineMinor = total(components, "revenue", "weighted_pipeline");
  const manualRevenueAdjustmentMinor = total(components, "revenue", "manual_adjustment");
  const payrollExpenseMinor = total(components, "expense", "payroll");
  const recurringOpexMinor = total(components, "expense", "recurring_opex");
  const manualExpenseAdjustmentMinor = total(components, "expense", "manual_adjustment");
  const openingCashMinor = total(components, "cash", "opening_cash");
  const expectedCollectionsMinor = total(components, "cash", "expected_collection");
  const financingMinor = total(components, "cash", "financing");
  const payrollCashOutMinor = -total(components, "cash", "payroll");
  const apDueMinor = -total(components, "cash", "ap_due");
  const recurringExpenseCashOutMinor = -total(components, "cash", "recurring_expense");
  const taxCashOutMinor = -total(components, "cash", "tax");
  const capexCashOutMinor = -total(components, "cash", "capex");
  const manualCashAdjustmentMinor = total(components, "cash", "manual_adjustment");

  return Object.freeze({
    organizationId: required(context.organizationId, "Forecast organization ID"),
    forecastVersionId: required(context.forecastVersionId, "Forecast version ID"),
    formulaVersion: "forecast-composition-v1",
    actualBasis: context.actualBasis,
    asOfDate: isoDate(context.asOfDate, "Forecast as-of date"),
    startsOn: isoDate(context.startsOn, "Forecast start date"),
    endsOn: isoDate(context.endsOn, "Forecast end date"),
    currency: currency(context.currency),
    actualToDateMinor: input.actualToDateMinor,
    committedMilestonesMinor,
    scheduledRecurringRevenueMinor,
    weightedPipelineMinor,
    manualRevenueAdjustmentMinor,
    projectedRevenueMinor:
      input.actualToDateMinor +
      committedMilestonesMinor +
      scheduledRecurringRevenueMinor +
      weightedPipelineMinor +
      manualRevenueAdjustmentMinor,
    payrollExpenseMinor,
    recurringOpexMinor,
    manualExpenseAdjustmentMinor,
    projectedExpenseMinor: payrollExpenseMinor + recurringOpexMinor + manualExpenseAdjustmentMinor,
    openingCashMinor,
    expectedCollectionsMinor,
    financingMinor,
    payrollCashOutMinor,
    apDueMinor,
    recurringExpenseCashOutMinor,
    taxCashOutMinor,
    capexCashOutMinor,
    manualCashAdjustmentMinor,
    projectedClosingCashMinor:
      openingCashMinor +
      expectedCollectionsMinor +
      financingMinor -
      payrollCashOutMinor -
      apDueMinor -
      recurringExpenseCashOutMinor -
      taxCashOutMinor -
      capexCashOutMinor +
      manualCashAdjustmentMinor,
    componentIds: uniqueSorted(components.map((component) => component.id)),
    sourceIds: uniqueSorted(components.map((component) => component.source.id)),
  });
}
