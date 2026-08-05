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
assert(input.fixtureId === "GF-TRANSFER-001", "Fixture identity mismatch");
assert(
  BigInt(input.outgoing.principalMinor) + BigInt(input.outgoing.bankFeeMinor) ===
    -BigInt(input.outgoing.amountMinor),
  "Outgoing amount must equal principal plus explicit fee",
);
assert(
  BigInt(input.outgoing.principalMinor) === BigInt(input.incoming.amountMinor),
  "Incoming leg must equal transfer principal",
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

const transfer = rows("expected-transfer.csv")[0];
assert(transfer[5] === "matched", "Transfer must finish matched");
assert(transfer[6] === "0", "Transit must finish at zero");
assert(transfer[7] === "0", "Principal must have zero P&L impact");
const fee = rows("expected-journals.csv").find((row) => row[5] === "explicit_fee_expense");
assert(fee?.[4] === "100000", "Explicit fee must remain VND 100,000");

console.log(
  "GF-TRANSFER-001: hashes, balanced journals, zero transit and zero principal P&L verified",
);
