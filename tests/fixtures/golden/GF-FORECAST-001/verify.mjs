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
assert(input.fixtureId === "GF-FORECAST-001", "Fixture identity mismatch");
const targets = rows("expected-target-versions.csv");
const scenarios = rows("expected-scenarios.csv");
assert(targets.length === input.targets.length, "Target row count mismatch");
assert(scenarios.length === input.forecasts.length, "Scenario row count mismatch");

const targetById = new Map(input.targets.map((target) => [target.id, target]));
for (const row of targets) {
  const target = targetById.get(row[0]);
  assert(target, `Missing target ${row[0]}`);
  const series = input.targets.filter(
    (candidate) =>
      candidate.periodKind === target.periodKind &&
      candidate.startsOn === target.startsOn &&
      candidate.endsOn === target.endsOn &&
      candidate.actualBasis === target.actualBasis,
  );
  const latest =
    Math.max(...series.map((candidate) => candidate.versionNumber)) === target.versionNumber;
  const calculated = [
    target.id,
    target.versionNumber,
    target.previousVersionId ?? "",
    target.periodKind,
    target.startsOn,
    target.endsOn,
    target.actualBasis,
    target.amountMinor,
    target.state,
    String(latest),
  ];
  assert(
    JSON.stringify(row) === JSON.stringify(calculated.map(String)),
    `${target.id} oracle mismatch`,
  );
  if (target.versionNumber > 1) {
    const previous = targetById.get(target.previousVersionId);
    assert(
      previous && previous.versionNumber === target.versionNumber - 1,
      `${target.id} version chain mismatch`,
    );
  }
}

const monthEndKeys = new Set();
for (const [index, forecast] of input.forecasts.entries()) {
  const immutable = forecast.snapshotKind === "month_end" && forecast.state === "published";
  const row = scenarios[index];
  const calculated = [
    forecast.id,
    forecast.versionNumber,
    forecast.scenario,
    forecast.customScenarioName ?? "",
    forecast.snapshotKind,
    forecast.asOfDate,
    forecast.startsOn,
    forecast.endsOn,
    forecast.actualBasis,
    forecast.state,
    String(immutable),
  ].map(String);
  assert(JSON.stringify(row) === JSON.stringify(calculated), `${forecast.id} scenario mismatch`);
  assert(
    forecast.scenario === "custom"
      ? Boolean(forecast.customScenarioName)
      : !forecast.customScenarioName,
    `${forecast.id} custom scenario naming mismatch`,
  );
  assert(!Object.hasOwn(forecast, "actualAmountMinor"), `${forecast.id} overwrites actual data`);
  if (forecast.snapshotKind === "month_end") {
    const monthEnd = new Date(
      Date.UTC(Number(forecast.asOfDate.slice(0, 4)), Number(forecast.asOfDate.slice(5, 7)), 0),
    )
      .toISOString()
      .slice(0, 10);
    assert(monthEnd === forecast.asOfDate, `${forecast.id} is not a month-end snapshot`);
    const key = `${forecast.scenario}:${forecast.customScenarioName ?? ""}:${forecast.asOfDate}`;
    assert(!monthEndKeys.has(key), `${forecast.id} overwrites a retained month-end snapshot`);
    monthEndKeys.add(key);
  }
}

const latest = targets.filter((row) => row[9] === "true");
const basisTotal = (basis) =>
  latest.filter((row) => row[6] === basis).reduce((sum, row) => sum + BigInt(row[7]), 0n);
const controls = new Map(rows("expected-control-tie.csv").map((row) => [row[0], row]));
const actual = new Map([
  ["target_version_count", BigInt(targets.length)],
  ["latest_target_count", BigInt(latest.length)],
  ["recognized_latest_target_minor", basisTotal("recognized")],
  ["invoiced_latest_target_minor", basisTotal("invoiced")],
  ["collected_latest_target_minor", basisTotal("collected")],
  ["scenario_count", BigInt(scenarios.length)],
  ["month_end_snapshot_count", BigInt(monthEndKeys.size)],
  ["actual_basis_count", BigInt(new Set(input.targets.map((target) => target.actualBasis)).size)],
]);
for (const [name, value] of actual) {
  const row = controls.get(name);
  assert(row, `Missing ${name} control`);
  assert(BigInt(row[1]) === value && BigInt(row[2]) === value, `${name} control mismatch`);
  assert(row[3] === "0" && row[4] === "tied_out", `${name} did not tie out`);
}

console.log("GF-FORECAST-001: target versions, bases, scenarios, snapshots and controls verified");
