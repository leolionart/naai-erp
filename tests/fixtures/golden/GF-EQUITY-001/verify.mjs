import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const directory = dirname(fileURLToPath(import.meta.url));
const text = (name) => readFileSync(join(directory, name), "utf8").replaceAll("\r\n", "\n");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const input = JSON.parse(text("input.json"));
assert(input.fixtureId === "GF-EQUITY-001", "fixture identity mismatch");
const capital = input.contributedCapital;
assert(
  BigInt(capital.closingMinor) ===
    BigInt(capital.openingMinor) + BigInt(capital.addedMinor) - BigInt(capital.withdrawnMinor),
  "contributed capital roll-forward mismatch",
);
const expectedClosingEquity =
  BigInt(input.openingEquityMinor) +
  BigInt(capital.addedMinor) -
  BigInt(capital.withdrawnMinor) +
  BigInt(input.netProfitMinor) +
  BigInt(input.reviewedEquityAdjustmentsMinor);
assert(
  expectedClosingEquity === BigInt(input.closingEquityMinor),
  "equity roll-forward control mismatch",
);
const accumulatedLoss =
  BigInt(input.retainedEarningsMinor) < 0n ? -BigInt(input.retainedEarningsMinor) : 0n;
assert(accumulatedLoss === 700000000n, "accumulated loss mismatch");
assert(
  (accumulatedLoss * 10000n) / BigInt(capital.closingMinor) === 10769n,
  "equity consumed mismatch",
);
const flows = input.reviewedOperatingNetCashFlowMinor.map(BigInt);
const averageFlow = flows.reduce((sum, value) => sum + value, 0n) / BigInt(flows.length);
const burn = averageFlow < 0n ? -averageFlow : 0n;
assert(
  averageFlow === -100000000n && burn === 100000000n,
  "signed average operating burn mismatch",
);
assert(Number(BigInt(input.cash.unrestrictedMinor)) / Number(burn) === 4.5, "runway mismatch");
assert(
  !text("expected-equity.csv").includes(`${input.ownerLoansMinor},yes`),
  "owner loans must be excluded from equity consumed",
);
assert(
  text("expected-liquidity.csv").includes(
    `${input.cash.restrictedMinor},${input.cash.restrictedMinor},excluded`,
  ),
  "restricted cash exclusion missing",
);
const purposes = input.roi.map((item) => item.purpose);
assert(
  purposes.includes("project") && purposes.includes("marketing") && input.roi.length === 2,
  "purpose-specific ROI objects missing",
);
const manifest = text("SHA256SUMS").trim().split("\n");
for (const row of manifest) {
  const match = row.match(/^([0-9a-f]{64}) {2}(.+)$/);
  assert(match, "malformed SHA256SUMS row");
  const actual = createHash("sha256")
    .update(readFileSync(join(directory, match[2])))
    .digest("hex");
  assert(actual === match[1], `${match[2]} hash mismatch`);
}
console.log("GF-EQUITY-001: equity, purpose ROI, signed burn, cash exclusions and hashes verified");
