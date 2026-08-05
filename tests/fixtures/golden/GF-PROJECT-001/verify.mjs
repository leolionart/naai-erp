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
const roundRatio = (numerator, denominator) =>
  denominator === 0n ? 0n : (numerator * 2n + denominator) / (denominator * 2n);

for (const line of text("SHA256SUMS").trimEnd().split("\n")) {
  const match = line.match(/^([0-9a-f]{64}) {2}(.+)$/);
  assert(match, "Malformed SHA256SUMS row");
  const actual = createHash("sha256")
    .update(readFileSync(join(directory, match[2])))
    .digest("hex");
  assert(actual === match[1], `${match[2]} hash mismatch`);
}

const input = JSON.parse(text("input.json"));
assert(input.fixtureId === "GF-PROJECT-001", "Fixture identity mismatch");
const expected = new Map(rows("expected-project-margin.csv").map((row) => [row[0], row]));

let revenueTotal = 0n;
let directTotal = 0n;
let variableTotal = 0n;
let fixedTotal = 0n;
let billableTotal = 0n;
let availableTotal = 0n;
let overrunTotal = 0n;
let unbilledTotal = 0n;
let overdueTotal = 0n;

for (const project of input.projects) {
  const revenue = BigInt(project.recognizedRevenueMinor);
  const direct = project.directCosts.reduce((sum, item) => sum + BigInt(item.amountMinor), 0n);
  const variable = project.overhead
    .filter((item) => item.costClass === "variable")
    .reduce((sum, item) => sum + BigInt(item.amountMinor), 0n);
  const fixed = project.overhead
    .filter((item) => item.costClass === "fixed")
    .reduce((sum, item) => sum + BigInt(item.amountMinor), 0n);
  const gross = revenue - direct;
  const contribution = gross - variable;
  const fullyLoaded = contribution - fixed;
  const billable = BigInt(project.billableHours);
  const available = BigInt(project.availableHours);
  const actualCost = direct + variable + fixed;
  const overrun =
    actualCost > BigInt(project.budgetCostMinor)
      ? actualCost - BigInt(project.budgetCostMinor)
      : 0n;
  const unbilled =
    revenue > BigInt(project.invoicedMinor) ? revenue - BigInt(project.invoicedMinor) : 0n;
  const overdue = BigInt(project.overdueArMinor);
  const flags = [
    unbilled > 0n ? "unbilled_work" : "",
    overdue > 0n ? "overdue_ar" : "",
    overrun > 0n ? "budget_overrun" : "",
  ]
    .filter(Boolean)
    .join("|");
  const row = expected.get(project.projectId);
  assert(row, `Missing expected row for ${project.projectId}`);
  const calculated = [
    project.projectId,
    revenue,
    direct,
    gross,
    roundRatio(gross * 10000n, revenue),
    variable,
    contribution,
    roundRatio(contribution * 10000n, revenue),
    fixed,
    fullyLoaded,
    roundRatio(fullyLoaded * 10000n, revenue),
    roundRatio(revenue, billable),
    roundRatio(billable * 10000n, available),
    overrun,
    unbilled,
    overdue,
    flags,
  ].map(String);
  assert(
    JSON.stringify(row) === JSON.stringify(calculated),
    `${project.projectId} oracle mismatch`,
  );

  revenueTotal += revenue;
  directTotal += direct;
  variableTotal += variable;
  fixedTotal += fixed;
  billableTotal += billable;
  availableTotal += available;
  overrunTotal += overrun;
  unbilledTotal += unbilled;
  overdueTotal += overdue;
}

const grossTotal = revenueTotal - directTotal;
const contributionTotal = grossTotal - variableTotal;
const fullyLoadedTotal = contributionTotal - fixedTotal;
const totalFlags = [
  unbilledTotal > 0n ? "unbilled_work" : "",
  overdueTotal > 0n ? "overdue_ar" : "",
  overrunTotal > 0n ? "budget_overrun" : "",
]
  .filter(Boolean)
  .join("|");
const total = [
  "TOTAL",
  revenueTotal,
  directTotal,
  grossTotal,
  roundRatio(grossTotal * 10000n, revenueTotal),
  variableTotal,
  contributionTotal,
  roundRatio(contributionTotal * 10000n, revenueTotal),
  fixedTotal,
  fullyLoadedTotal,
  roundRatio(fullyLoadedTotal * 10000n, revenueTotal),
  roundRatio(revenueTotal, billableTotal),
  roundRatio(billableTotal * 10000n, availableTotal),
  overrunTotal,
  unbilledTotal,
  overdueTotal,
  totalFlags,
].map(String);
assert(JSON.stringify(expected.get("TOTAL")) === JSON.stringify(total), "TOTAL oracle mismatch");

const controls = new Map(rows("expected-control-tie.csv").map((row) => [row[0], row]));
const actualControls = new Map([
  ["recognized_revenue", revenueTotal],
  ["direct_project_cost", directTotal],
  ["variable_overhead", variableTotal],
  ["fixed_overhead", fixedTotal],
]);
for (const [name, reportAmount] of actualControls) {
  const row = controls.get(name);
  assert(row, `Missing ${name} control`);
  assert(
    BigInt(row[1]) ===
      BigInt(input.ledgerControls[`${name.replace(/_([a-z])/g, (_, c) => c.toUpperCase())}Minor`]),
    `${name} ledger input mismatch`,
  );
  assert(BigInt(row[2]) === reportAmount, `${name} report control mismatch`);
  assert(row[3] === "0" && row[4] === "tied_out", `${name} did not tie out`);
}

console.log("GF-PROJECT-001: hashes, profitability layers, KPI denominators and GL ties verified");
