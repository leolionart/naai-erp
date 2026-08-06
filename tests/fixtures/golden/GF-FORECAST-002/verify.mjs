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
assert(input.fixtureId === "GF-FORECAST-002", "Fixture identity mismatch");
assert(input.actualBasis === "recognized", "Actual basis must remain explicit");

const componentRows = rows("expected-components.csv");
assert(componentRows.length === input.components.length, "Component row count mismatch");
const byId = new Map(input.components.map((component) => [component.id, component]));
const signedWeighted = (component) => {
  const amount = BigInt(component.amountMinor);
  const weighted = (amount * BigInt(component.probabilityBps) + 5_000n) / 10_000n;
  return component.direction === "increase" ? weighted : -weighted;
};
for (const row of componentRows) {
  const component = byId.get(row[0]);
  assert(component, `Missing component ${row[0]}`);
  const calculated = [
    component.id,
    component.section,
    component.kind,
    component.direction,
    component.amountMinor,
    component.probabilityBps,
    signedWeighted(component),
  ].map(String);
  assert(JSON.stringify(row) === JSON.stringify(calculated), `${component.id} oracle mismatch`);
  if (component.kind === "manual_adjustment") {
    assert(component.reviewState === "reviewed", `${component.id} is pending review`);
    assert(component.createdBy !== component.reviewedBy, `${component.id} violates maker-checker`);
  }
}

const total = (section, kind) =>
  input.components
    .filter((component) => component.section === section && component.kind === kind)
    .reduce((sum, component) => sum + signedWeighted(component), 0n);
const values = new Map([
  ["actual_to_date", BigInt(input.actualToDateMinor)],
  ["committed_milestones", total("revenue", "committed_milestone")],
  ["scheduled_recurring_revenue", total("revenue", "scheduled_recurring")],
  ["weighted_pipeline", total("revenue", "weighted_pipeline")],
  ["manual_revenue_adjustment", total("revenue", "manual_adjustment")],
  ["payroll_expense", total("expense", "payroll")],
  ["recurring_opex", total("expense", "recurring_opex")],
  ["manual_expense_adjustment", total("expense", "manual_adjustment")],
  ["opening_cash", total("cash", "opening_cash")],
  ["expected_collections", total("cash", "expected_collection")],
  ["financing", total("cash", "financing")],
  ["payroll_cash_out", -total("cash", "payroll")],
  ["ap_due", -total("cash", "ap_due")],
  ["recurring_expense_cash_out", -total("cash", "recurring_expense")],
  ["tax_cash_out", -total("cash", "tax")],
  ["capex_cash_out", -total("cash", "capex")],
  ["manual_cash_adjustment", total("cash", "manual_adjustment")],
]);
values.set(
  "projected_revenue",
  values.get("actual_to_date") +
    values.get("committed_milestones") +
    values.get("scheduled_recurring_revenue") +
    values.get("weighted_pipeline") +
    values.get("manual_revenue_adjustment"),
);
values.set(
  "projected_expense",
  values.get("payroll_expense") +
    values.get("recurring_opex") +
    values.get("manual_expense_adjustment"),
);
values.set(
  "projected_closing_cash",
  values.get("opening_cash") +
    values.get("expected_collections") +
    values.get("financing") -
    values.get("payroll_cash_out") -
    values.get("ap_due") -
    values.get("recurring_expense_cash_out") -
    values.get("tax_cash_out") -
    values.get("capex_cash_out") +
    values.get("manual_cash_adjustment"),
);

for (const [metric, expected] of rows("expected-composition.csv")) {
  assert(values.has(metric), `Unknown composition metric ${metric}`);
  assert(values.get(metric) === BigInt(expected), `${metric} composition mismatch`);
}

const duplicateKeys = input.negativeControls.duplicateCommercialSource.map(
  (item) =>
    `${item.section}:${item.source.commercialRootType}:${item.source.commercialRootId}:${item.scheduledOn}`,
);
const duplicateRejected = new Set(duplicateKeys).size < duplicateKeys.length;
const ownerFunding = input.components.find(
  (component) => component.source.type === "owner_funding",
);
const ownerFundingFinancingOnly =
  ownerFunding?.section === "cash" &&
  ownerFunding.kind === "financing" &&
  ownerFunding.direction === "increase" &&
  input.negativeControls.misclassifiedOwnerFunding.section !== "cash";
const pendingManualCount = input.components.filter(
  (component) => component.kind === "manual_adjustment" && component.reviewState !== "reviewed",
).length;

const controlValues = new Map([
  ["component_count", BigInt(input.components.length)],
  ["projected_revenue_minor", values.get("projected_revenue")],
  ["projected_expense_minor", values.get("projected_expense")],
  ["projected_closing_cash_minor", values.get("projected_closing_cash")],
  ["duplicate_commercial_source_rejected", duplicateRejected ? 1n : 0n],
  ["owner_funding_financing_only", ownerFundingFinancingOnly ? 1n : 0n],
  ["pending_manual_adjustment_count", BigInt(pendingManualCount)],
]);
for (const [name, source, fixture, difference, status] of rows("expected-control-tie.csv")) {
  const actual = controlValues.get(name);
  assert(actual !== undefined, `Missing control ${name}`);
  assert(actual === BigInt(source) && actual === BigInt(fixture), `${name} control mismatch`);
  assert(difference === "0" && status === "tied_out", `${name} did not tie out`);
}

console.log("GF-FORECAST-002: revenue, expense, cash and classification controls verified");
