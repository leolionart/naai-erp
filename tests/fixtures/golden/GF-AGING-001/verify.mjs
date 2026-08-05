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
assert(input.fixtureId === "GF-AGING-001", "Fixture identity mismatch");

const ar = rows("expected-ar.csv");
const ap = rows("expected-ap.csv");
for (const day of ["0", "1", "30", "31", "60", "61", "90", "91", "92"])
  assert(
    [...ar, ...ap].some((row) => row[3] === day),
    `Missing boundary day ${day}`,
  );

for (const row of [...ar, ...ap]) {
  assert(BigInt(row[8]) === BigInt(row[6]) - BigInt(row[7]), `${row[0]} outstanding mismatch`);
}

const arDebit = ar
  .filter((row) => row[5] === "debit")
  .reduce((sum, row) => sum + BigInt(row[8]), 0n);
const arCredit = ar
  .filter((row) => row[5] === "credit")
  .reduce((sum, row) => sum + BigInt(row[8]), 0n);
const apCredit = ap
  .filter((row) => row[5] === "credit")
  .reduce((sum, row) => sum + BigInt(row[8]), 0n);
const apAdvance = ap
  .filter((row) => row[5] === "advance")
  .reduce((sum, row) => sum + BigInt(row[8]), 0n);

const ties = new Map(rows("expected-tie.csv").map((row) => [row[0], row]));
assert(arDebit === 135000000n && arCredit === 5000000n, "AR reviewed totals mismatch");
assert(apCredit === 146000000n && apAdvance === 7000000n, "AP reviewed totals mismatch");
assert(BigInt(ties.get("ar")[4]) === arDebit - arCredit, "AR subledger tie mismatch");
assert(BigInt(ties.get("ap")[4]) === apCredit - apAdvance, "AP subledger tie mismatch");
for (const row of ties.values())
  assert(row[6] === "0" && row[7] === "tied_out", `${row[0]} control tie failed`);

console.log("GF-AGING-001: hashes, bucket boundaries, credits/advances and control ties verified");
