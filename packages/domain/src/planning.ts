export const TARGET_PERIOD_KINDS = ["month", "quarter", "year"] as const;
export type TargetPeriodKind = (typeof TARGET_PERIOD_KINDS)[number];
export const ACTUAL_BASES = ["recognized", "invoiced", "collected"] as const;
export type ActualBasis = (typeof ACTUAL_BASES)[number];
export const FORECAST_SCENARIOS = ["base", "best", "worst", "custom"] as const;
export type ForecastScenario = (typeof FORECAST_SCENARIOS)[number];
export type PlanningVersionState = "draft" | "published" | "superseded";
export type ForecastSnapshotKind = "working" | "month_end";

export type PlanningDimensions = Readonly<{
  teamId?: string;
  serviceLineCode?: string;
  ownerId?: string;
}>;

export type RevenueTargetVersion = Readonly<{
  organizationId: string;
  id: string;
  versionNumber: number;
  previousVersionId?: string;
  periodKind: TargetPeriodKind;
  startsOn: string;
  endsOn: string;
  actualBasis: ActualBasis;
  currency: string;
  amountMinor: bigint;
  dimensions: PlanningDimensions;
  state: PlanningVersionState;
  version: number;
  publishedAt?: string;
  publishedBy?: string;
}>;

export type ForecastVersion = Readonly<{
  organizationId: string;
  id: string;
  versionNumber: number;
  previousVersionId?: string;
  scenario: ForecastScenario;
  customScenarioName?: string;
  snapshotKind: ForecastSnapshotKind;
  asOfDate: string;
  startsOn: string;
  endsOn: string;
  actualBasis: ActualBasis;
  currency: string;
  dimensions: PlanningDimensions;
  state: PlanningVersionState;
  version: number;
  publishedAt?: string;
  publishedBy?: string;
}>;

const required = (value: string, label: string): string => {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
};

function isoDate(value: string, label: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`${label} must be an ISO date`);
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
  if (!/^[A-Z]{3}$/.test(normalized)) throw new Error("Planning currency must be ISO-4217");
  return normalized;
}

function dimensions(input?: PlanningDimensions): PlanningDimensions {
  const normalized = Object.fromEntries(
    Object.entries(input ?? {}).map(([key, value]) => [key, required(value, `Planning ${key}`)]),
  );
  return Object.freeze(normalized);
}

function assertRange(startsOn: string, endsOn: string): void {
  if (startsOn > endsOn) throw new Error("Planning period start must not follow end");
}

function expectedPeriodEnd(startsOn: string, kind: TargetPeriodKind): string {
  const date = new Date(`${startsOn}T00:00:00.000Z`);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  if (date.getUTCDate() !== 1) throw new Error("Target period must start on the first day");
  if (kind === "quarter" && month % 3 !== 0) {
    throw new Error("Quarter target must start on a calendar quarter boundary");
  }
  if (kind === "year" && month !== 0) {
    throw new Error("Year target must start on January 1");
  }
  const months = kind === "month" ? 1 : kind === "quarter" ? 3 : 12;
  return new Date(Date.UTC(year, month + months, 0)).toISOString().slice(0, 10);
}

export function createRevenueTargetVersion(input: {
  organizationId: string;
  id: string;
  versionNumber: number;
  previousVersionId?: string;
  periodKind: TargetPeriodKind;
  startsOn: string;
  endsOn: string;
  actualBasis: ActualBasis;
  currency: string;
  amountMinor: bigint;
  dimensions?: PlanningDimensions;
}): RevenueTargetVersion {
  if (!Number.isInteger(input.versionNumber) || input.versionNumber < 1) {
    throw new Error("Target version number must be positive");
  }
  if (input.amountMinor < 0n) throw new Error("Target amount cannot be negative");
  const startsOn = isoDate(input.startsOn, "Target start date");
  const endsOn = isoDate(input.endsOn, "Target end date");
  if (expectedPeriodEnd(startsOn, input.periodKind) !== endsOn) {
    throw new Error(`Target dates do not form a calendar ${input.periodKind}`);
  }
  return Object.freeze({
    organizationId: required(input.organizationId, "Target organization ID"),
    id: required(input.id, "Target ID"),
    versionNumber: input.versionNumber,
    ...(input.previousVersionId
      ? { previousVersionId: required(input.previousVersionId, "Previous target ID") }
      : {}),
    periodKind: input.periodKind,
    startsOn,
    endsOn,
    actualBasis: input.actualBasis,
    currency: currency(input.currency),
    amountMinor: input.amountMinor,
    dimensions: dimensions(input.dimensions),
    state: "draft",
    version: 1,
  });
}

const targetSeriesKey = (target: RevenueTargetVersion) =>
  JSON.stringify([
    target.organizationId,
    target.periodKind,
    target.startsOn,
    target.endsOn,
    target.actualBasis,
    target.currency,
    target.dimensions.teamId ?? null,
    target.dimensions.serviceLineCode ?? null,
    target.dimensions.ownerId ?? null,
  ]);

export function assertRevenueTargetVersionSequence(
  candidate: RevenueTargetVersion,
  existing: readonly RevenueTargetVersion[],
): void {
  const series = existing.filter(
    (target) => targetSeriesKey(target) === targetSeriesKey(candidate),
  );
  if (
    existing.some(
      (target) => target.organizationId === candidate.organizationId && target.id === candidate.id,
    )
  ) {
    throw new Error("Target ID must be unique by organization");
  }
  const maximum = series.reduce((max, target) => Math.max(max, target.versionNumber), 0);
  if (candidate.versionNumber !== maximum + 1) throw new Error("Target version must be sequential");
  if (maximum === 0 && candidate.previousVersionId)
    throw new Error("First target version cannot reference a previous version");
  if (maximum > 0) {
    const previous = series.find((target) => target.id === candidate.previousVersionId);
    if (!previous || previous.state !== "published" || previous.versionNumber !== maximum) {
      throw new Error("Target revision must reference the latest published version");
    }
  }
}

export function publishRevenueTargetVersion(
  target: RevenueTargetVersion,
  existing: readonly RevenueTargetVersion[],
  actorId: string,
  publishedAt: string,
): RevenueTargetVersion {
  if (target.state !== "draft") throw new Error("Only draft target can be published");
  assertRevenueTargetVersionSequence(target, existing);
  return Object.freeze({
    ...target,
    state: "published",
    publishedBy: required(actorId, "Target publisher"),
    publishedAt: timestamp(publishedAt, "Target published time"),
    version: target.version + 1,
  });
}

export function supersedeRevenueTargetVersion(target: RevenueTargetVersion): RevenueTargetVersion {
  if (target.state !== "published") throw new Error("Only published target can be superseded");
  return Object.freeze({ ...target, state: "superseded", version: target.version + 1 });
}

export function createForecastVersion(input: {
  organizationId: string;
  id: string;
  versionNumber: number;
  previousVersionId?: string;
  scenario: ForecastScenario;
  customScenarioName?: string;
  snapshotKind: ForecastSnapshotKind;
  asOfDate: string;
  startsOn: string;
  endsOn: string;
  actualBasis: ActualBasis;
  currency: string;
  dimensions?: PlanningDimensions;
}): ForecastVersion {
  if (!Number.isInteger(input.versionNumber) || input.versionNumber < 1) {
    throw new Error("Forecast version number must be positive");
  }
  const startsOn = isoDate(input.startsOn, "Forecast start date");
  const endsOn = isoDate(input.endsOn, "Forecast end date");
  const asOfDate = isoDate(input.asOfDate, "Forecast as-of date");
  assertRange(startsOn, endsOn);
  if (asOfDate > endsOn) throw new Error("Forecast as-of date must not follow period end");
  if (input.snapshotKind === "month_end") {
    const monthEnd = new Date(
      Date.UTC(Number(asOfDate.slice(0, 4)), Number(asOfDate.slice(5, 7)), 0),
    )
      .toISOString()
      .slice(0, 10);
    if (asOfDate !== monthEnd) throw new Error("Month-end snapshot as-of date must be month end");
  }
  const customScenarioName = input.customScenarioName?.trim();
  if (input.scenario === "custom" && !customScenarioName) {
    throw new Error("Custom forecast scenario requires a name");
  }
  if (input.scenario !== "custom" && customScenarioName) {
    throw new Error("Only custom forecast scenario may have a custom name");
  }
  return Object.freeze({
    organizationId: required(input.organizationId, "Forecast organization ID"),
    id: required(input.id, "Forecast ID"),
    versionNumber: input.versionNumber,
    ...(input.previousVersionId
      ? { previousVersionId: required(input.previousVersionId, "Previous forecast ID") }
      : {}),
    scenario: input.scenario,
    ...(customScenarioName ? { customScenarioName } : {}),
    snapshotKind: input.snapshotKind,
    asOfDate,
    startsOn,
    endsOn,
    actualBasis: input.actualBasis,
    currency: currency(input.currency),
    dimensions: dimensions(input.dimensions),
    state: "draft",
    version: 1,
  });
}

const forecastSeriesKey = (forecast: ForecastVersion) =>
  JSON.stringify([
    forecast.organizationId,
    forecast.scenario,
    forecast.customScenarioName ?? null,
    forecast.startsOn,
    forecast.endsOn,
    forecast.actualBasis,
    forecast.currency,
    forecast.dimensions.teamId ?? null,
    forecast.dimensions.serviceLineCode ?? null,
    forecast.dimensions.ownerId ?? null,
  ]);

export function assertForecastVersionSequence(
  candidate: ForecastVersion,
  existing: readonly ForecastVersion[],
): void {
  if (
    existing.some(
      (forecast) =>
        forecast.organizationId === candidate.organizationId && forecast.id === candidate.id,
    )
  ) {
    throw new Error("Forecast ID must be unique by organization");
  }
  const series = existing.filter(
    (forecast) => forecastSeriesKey(forecast) === forecastSeriesKey(candidate),
  );
  const maximum = series.reduce((max, forecast) => Math.max(max, forecast.versionNumber), 0);
  if (candidate.versionNumber !== maximum + 1)
    throw new Error("Forecast version must be sequential");
  if (maximum === 0 && candidate.previousVersionId)
    throw new Error("First forecast version cannot reference a previous version");
  if (maximum > 0) {
    const previous = series.find((forecast) => forecast.id === candidate.previousVersionId);
    if (!previous || previous.state !== "published" || previous.versionNumber !== maximum) {
      throw new Error("Forecast revision must reference the latest published version");
    }
  }
  if (
    candidate.snapshotKind === "month_end" &&
    series.some(
      (forecast) =>
        forecast.snapshotKind === "month_end" && forecast.asOfDate === candidate.asOfDate,
    )
  ) {
    throw new Error("Month-end forecast snapshot already exists for this scenario and period");
  }
}

export function publishForecastVersion(
  forecast: ForecastVersion,
  existing: readonly ForecastVersion[],
  actorId: string,
  publishedAt: string,
): ForecastVersion {
  if (forecast.state !== "draft") throw new Error("Only draft forecast can be published");
  assertForecastVersionSequence(forecast, existing);
  return Object.freeze({
    ...forecast,
    state: "published",
    publishedBy: required(actorId, "Forecast publisher"),
    publishedAt: timestamp(publishedAt, "Forecast published time"),
    version: forecast.version + 1,
  });
}

export function supersedeForecastVersion(forecast: ForecastVersion): ForecastVersion {
  if (forecast.state !== "published") throw new Error("Only published forecast can be superseded");
  if (forecast.snapshotKind === "month_end") {
    throw new Error("Month-end forecast snapshots are immutable and cannot be superseded");
  }
  return Object.freeze({ ...forecast, state: "superseded", version: forecast.version + 1 });
}
