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
assert(input.fixtureId === "GF-BANK-001", "Fixture identity mismatch");
const receipts = input.receipts.reduce((sum, item) => sum + BigInt(item.amountMinor), 0n);
assert(
  receipts === BigInt(input.salesInvoice.grossMinor),
  "60m + 50m must settle the 110m invoice",
);
assert(
  BigInt(input.supplierPayment.principalMinor) + BigInt(input.supplierPayment.bankFeeMinor) ===
    -BigInt(input.supplierPayment.amountMinor),
  "109m principal + 1m fee must explain the 110m bank outflow",
);

const journals = new Map();
for (const row of rows("expected-journals.csv")) {
  const [journalId, , side, , amount] = row;
  const totals = journals.get(journalId) ?? { debit: 0n, credit: 0n };
  totals[side] += BigInt(amount);
  journals.set(journalId, totals);
}
for (const [journalId, totals] of journals) {
  assert(totals.debit === totals.credit, `${journalId} is not balanced`);
}

const allocations = rows("expected-allocations.csv");
const sales = allocations.filter((row) => row[3] === "sales_invoice");
assert(
  sales.reduce((sum, row) => sum + BigInt(row[5]), 0n) === 110_000_000n,
  "Sales allocations do not total 110m",
);
assert(sales.at(-1)?.[8] === "0", "Sales invoice must finish with zero outstanding");
const fee = allocations.find((row) => row[3] === "bank_fee");
assert(fee?.[5] === "1000000", "Bank fee must remain a separate 1m allocation");

console.log("GF-BANK-001: hashes, 60m+50m settlement, 109m+1m outflow and journals verified");
