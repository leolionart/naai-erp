import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const directory = dirname(fileURLToPath(import.meta.url));
const text = (name) => readFileSync(join(directory, name), "utf8").replaceAll("\r\n", "\n");
const rows = (name) =>
  text(name)
    .trimEnd()
    .split("\n")
    .slice(1)
    .map((line) => line.split(","));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

for (const line of text("SHA256SUMS").trimEnd().split("\n")) {
  const match = line.match(/^([0-9a-f]{64}) {2}(.+)$/);
  assert(match, "Malformed SHA256SUMS row");
  const actual = createHash("sha256")
    .update(readFileSync(join(directory, match[2])))
    .digest("hex");
  assert(actual === match[1], `${match[2]} hash mismatch`);
}

const input = JSON.parse(text("input.json"));
assert(input.fixtureId === "GF-KPI-001", "Fixture identity mismatch");
assert(input.timezone === "Asia/Ho_Chi_Minh", "Fixture timezone mismatch");

const parseDate = (value) => {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
};
const daysInclusive = (startsOn, endsOn) =>
  Math.floor((parseDate(endsOn) - parseDate(startsOn)) / 86_400_000) + 1;
const localDate = (instant) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: input.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(instant));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
};
const halfUp = (numerator, denominator) => {
  assert(denominator > 0n, "Oracle denominator must be positive");
  const negative = numerator < 0n;
  const absolute = negative ? -numerator : numerator;
  const rounded = (absolute + denominator / 2n) / denominator;
  return negative ? -rounded : rounded;
};
const periodById = new Map(input.periods.map((period) => [period.id, period]));

const cutoffRows = rows("expected-cutoffs.csv");
let leapClampCount = 0;
for (const row of cutoffRows) {
  const [instant, timezone, expectedLocalDate, periodId, elapsed, total, comparable] = row;
  assert(timezone === input.timezone, `${instant} timezone mismatch`);
  const actualLocalDate = localDate(instant);
  assert(actualLocalDate === expectedLocalDate, `${instant} local date mismatch`);
  const period = periodById.get(periodId);
  assert(period, `Missing period ${periodId}`);
  assert(
    actualLocalDate >= period.startsOn && actualLocalDate <= period.endsOn,
    `${instant} does not belong to ${periodId}`,
  );
  assert(
    daysInclusive(period.startsOn, actualLocalDate) === Number(elapsed),
    `${periodId} elapsed-day mismatch`,
  );
  assert(
    daysInclusive(period.startsOn, period.endsOn) === Number(total),
    `${periodId} day count mismatch`,
  );
  if (expectedLocalDate === "2024-02-29") {
    assert(comparable === "2023-02-28", "Leap-day prior-year comparison was not clamped");
    leapClampCount += 1;
  }
}

const observations = input.observations;
const prorated = (amount, elapsed, total) =>
  halfUp(BigInt(amount) * BigInt(elapsed), BigInt(total));
const calendarProrated = prorated(observations.fullMonthTargetMinor, 15, 29);
const fiscalProrated = prorated(observations.fiscalFullTargetMinor, 21, 31);

const cases = new Map([
  ["calendar_mtd_prorated_target", [BigInt(observations.mtdRecognizedMinor), calendarProrated]],
  [
    "calendar_mtd_full_target",
    [BigInt(observations.mtdRecognizedMinor), BigInt(observations.fullMonthTargetMinor)],
  ],
  [
    "calendar_mom",
    [BigInt(observations.mtdRecognizedMinor), BigInt(observations.priorMonthComparableMinor)],
  ],
  [
    "calendar_yoy",
    [BigInt(observations.mtdRecognizedMinor), BigInt(observations.priorYearComparableMinor)],
  ],
  [
    "forecast_vs_target",
    [BigInt(observations.currentForecastMinor), BigInt(observations.fullMonthTargetMinor)],
  ],
  [
    "retained_forecast_accuracy",
    [
      BigInt(observations.closedPeriodActualMinor),
      BigInt(observations.retainedForecastSnapshotMinor),
    ],
  ],
  ["missing_prior_year", [BigInt(observations.missingComparisonActualMinor), null]],
  [
    "zero_denominator",
    [
      BigInt(observations.zeroDenominatorActualMinor),
      BigInt(observations.zeroDenominatorComparisonMinor),
    ],
  ],
  ["fiscal_mtd_prorated_target", [BigInt(observations.fiscalMtdActualMinor), fiscalProrated]],
]);

const comparisonRows = rows("expected-comparisons.csv");
for (const row of comparisonRows) {
  const [
    id,
    periodId,
    definition,
    actualBasis,
    ,
    actualText,
    comparisonText,
    varianceText,
    varianceBpsText,
    attainmentBpsText,
    status,
    unavailableReason,
  ] = row;
  const period = periodById.get(periodId);
  assert(period?.definition === definition, `${id} period definition mismatch`);
  assert(actualBasis === input.selectedActualBasis, `${id} actual basis mismatch`);
  const [actual, comparison] = cases.get(id) ?? [];
  assert(actual !== undefined && actual.toString() === actualText, `${id} actual mismatch`);
  if (comparison === null) {
    assert(
      comparisonText === "" &&
        varianceText === "" &&
        varianceBpsText === "" &&
        attainmentBpsText === "",
      `${id} missing comparison must return null outputs`,
    );
    assert(
      status === "not_available" && unavailableReason === "missing_comparison",
      `${id} status mismatch`,
    );
    continue;
  }
  assert(comparison.toString() === comparisonText, `${id} comparator mismatch`);
  const variance = actual - comparison;
  assert(variance.toString() === varianceText, `${id} amount variance mismatch`);
  if (comparison === 0n) {
    assert(
      varianceBpsText === "" && attainmentBpsText === "",
      `${id} zero denominator must return null bps`,
    );
    assert(
      status === "not_available" && unavailableReason === "zero_denominator",
      `${id} zero status mismatch`,
    );
  } else {
    assert(
      halfUp(variance * 10_000n, comparison).toString() === varianceBpsText,
      `${id} variance bps mismatch`,
    );
    assert(
      halfUp(actual * 10_000n, comparison).toString() === attainmentBpsText,
      `${id} attainment mismatch`,
    );
    assert(status === "available" && unavailableReason === "", `${id} availability mismatch`);
  }
}

const selectedBasisActual = input.actualAxesAtCutoff[`${input.selectedActualBasis}Minor`];
const controls = new Map([
  ["comparison_row_count", BigInt(comparisonRows.length)],
  ["calendar_period_days", 29n],
  ["calendar_elapsed_days", 15n],
  ["calendar_prorated_target_minor", calendarProrated],
  ["fiscal_period_days", 31n],
  ["fiscal_elapsed_days", 21n],
  ["fiscal_prorated_target_minor", fiscalProrated],
  ["selected_basis_actual_minor", BigInt(selectedBasisActual)],
  [
    "missing_comparison_na_count",
    BigInt(comparisonRows.filter((row) => row[11] === "missing_comparison").length),
  ],
  [
    "zero_denominator_na_count",
    BigInt(comparisonRows.filter((row) => row[11] === "zero_denominator").length),
  ],
  ["leap_day_clamp_count", BigInt(leapClampCount)],
]);
for (const [name, source, fixture, difference, status] of rows("expected-control-tie.csv")) {
  const actual = controls.get(name);
  assert(actual !== undefined, `Missing control ${name}`);
  assert(actual === BigInt(source) && actual === BigInt(fixture), `${name} control mismatch`);
  assert(difference === "0" && status === "tied_out", `${name} did not tie out`);
}

console.log("GF-KPI-001: MTD, MoM, YoY, forecast, null policy and cutoff controls verified");
