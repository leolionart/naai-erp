import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const directory = dirname(fileURLToPath(import.meta.url));
const text = (name) => readFileSync(join(directory, name), "utf8").replaceAll("\r\n", "\n");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const moneyRows = (name) =>
  new Map(
    text(name)
      .trimEnd()
      .split("\n")
      .slice(1)
      .map((line) => {
        const [key, value] = line.split(",");
        return [key, BigInt(value)];
      }),
  );
for (const line of text("SHA256SUMS").trimEnd().split("\n")) {
  const match = line.match(/^([0-9a-f]{64}) {2}(.+)$/);
  assert(match, "Malformed SHA256SUMS");
  assert(
    createHash("sha256")
      .update(readFileSync(join(directory, match[2])))
      .digest("hex") === match[1],
    `${match[2]} hash mismatch`,
  );
}
const input = JSON.parse(text("input.json"));
assert(input.fixtureId === "GF-VAT-001", "Fixture identity mismatch");
let output = 0n,
  inputVat = 0n,
  eligible = 0n,
  ineligible = 0n,
  unreviewed = 0n;
const missingEvidence = [],
  unreconciled = [],
  invalidCode = [],
  unreviewedItems = [];
for (const item of input.vatItems) {
  const amount = BigInt(item.taxMinor),
    sign = item.direction === "reversal" ? -1n : 1n;
  if (item.missingEvidence) missingEvidence.push(item.id);
  if (!item.posted) unreconciled.push(item.id);
  if (!item.taxCodeApproved) invalidCode.push(item.id);
  if (item.taxKind === "output") {
    output += sign * amount;
    continue;
  }
  inputVat += sign * amount;
  if (item.reviewState === "eligible") eligible += sign * amount;
  else if (
    item.reviewState === "partially_eligible" ||
    item.reviewState === "accountant_override"
  ) {
    const e = BigInt(item.eligibleMinor);
    eligible += sign * e;
    ineligible += sign * (amount - e);
  } else if (item.reviewState === "ineligible") ineligible += sign * amount;
  else {
    unreviewed += sign * amount;
    unreviewedItems.push(item.id);
  }
}
const outputLedger = BigInt(input.ledger.outputVatMinor),
  inputLedger = BigInt(input.ledger.inputVatMinor);
const calculatedVat = new Map([
  ["output_vat", output],
  ["input_vat", inputVat],
  ["eligible_input_vat", eligible],
  ["ineligible_input_vat", ineligible],
  ["unreviewed_input_vat", unreviewed],
  ["net_vat_payable", output - eligible],
  ["output_ledger", outputLedger],
  ["input_ledger", inputLedger],
  ["output_difference", output - outputLedger],
  ["input_difference", inputVat - inputLedger],
]);
for (const [key, value] of moneyRows("expected-vat-reconciliation.csv"))
  assert(calculatedVat.get(key) === value, `VAT ${key} mismatch`);
const totals = {
  accounting_booked: 0n,
  cit_basis: 0n,
  cit_eligible: 0n,
  cit_ineligible: 0n,
  cit_unreviewed: 0n,
  vat_basis: 0n,
  vat_eligible: 0n,
  vat_ineligible: 0n,
  vat_unreviewed: 0n,
};
for (const item of input.taxExpenseItems) {
  totals.accounting_booked += BigInt(item.accountingBookedMinor);
  totals.cit_basis += BigInt(item.citBasisMinor);
  totals.vat_basis += BigInt(item.vatBasisMinor);
  for (const axis of ["cit", "vat"]) {
    const basis = BigInt(item[`${axis}BasisMinor`]),
      state = item[`${axis}State`],
      e = item[`${axis}EligibleMinor`] === undefined ? 0n : BigInt(item[`${axis}EligibleMinor`]);
    if (state === "eligible") totals[`${axis}_eligible`] += basis;
    else if (state === "partially_eligible" || state === "accountant_override") {
      totals[`${axis}_eligible`] += e;
      totals[`${axis}_ineligible`] += basis - e;
    } else if (state === "ineligible") totals[`${axis}_ineligible`] += basis;
    else totals[`${axis}_unreviewed`] += basis;
  }
}
for (const [key, value] of moneyRows("expected-tax-expense-review.csv"))
  assert(totals[key] === value, `Tax expense ${key} mismatch`);
const controls = new Map(
  text("expected-controls.csv")
    .trimEnd()
    .split("\n")
    .slice(1)
    .map((line) => line.split(",")),
);
const sorted = (values) => values.sort().join("|");
assert(controls.get("status") === "review_required", "Strict policy should block readiness");
assert(
  controls.get("missing_evidence_items") === sorted(missingEvidence),
  "Missing-evidence controls mismatch",
);
assert(
  controls.get("unreconciled_items") === sorted(unreconciled),
  "Unreconciled controls mismatch",
);
assert(
  controls.get("invalid_tax_code_items") === sorted(invalidCode),
  "Tax-code controls mismatch",
);
assert(
  controls.get("unreviewed_items") === sorted(unreviewedItems),
  "Unreviewed controls mismatch",
);
console.log("GF-VAT-001: VAT reconciliation and tax expense axes verified independently");
