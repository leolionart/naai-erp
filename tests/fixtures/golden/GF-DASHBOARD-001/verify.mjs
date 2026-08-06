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
assert(input.fixtureId === "GF-DASHBOARD-001", "fixture identity mismatch");

const sourcePaths = {
  revenueMinor: input.canonicalReports.profitAndLoss.revenueMinor,
  netProfitMinor: input.canonicalReports.profitAndLoss.netProfitMinor,
  unrestrictedCashMinor: input.canonicalReports.executiveMetrics.unrestrictedCashMinor,
  runwayMonthsThousandths: input.canonicalReports.executiveMetrics.runwayMonthsThousandths,
  topProjectProfitMinor: input.canonicalReports.projectProfitability.fullyLoadedProfitMinor,
  overdueReceivablesMinor: input.canonicalReports.arAging.baseOutstandingTotalMinor,
  financeReviewCount: input.canonicalReports.expenseExceptions.openCount,
};
for (const [key, canonical] of Object.entries(sourcePaths)) {
  assert(String(input.dashboard[key]) === String(canonical), `${key} differs from canonical API`);
}

const target = BigInt(input.financialStatementRow.amountMinor);
const drilldownTotal = input.drilldown.items.reduce(
  (sum, item) => sum + BigInt(item.amountMinor),
  0n,
);
assert(drilldownTotal === target, "financial drill-down does not sum to dashboard report row");

const allowedTypes = new Set([
  "journal_line",
  "journal_entry",
  "commercial_document",
  "expense",
  "evidence",
]);
for (const item of input.drilldown.items) {
  const types = item.refs.map((ref) => ref.resourceType);
  assert(types[0] === "journal_line", `${item.journalId} must start at its journal line`);
  assert(types.includes("journal_entry"), `${item.journalId} journal entry ref missing`);
  assert(
    types.includes("commercial_document") || types.includes("expense"),
    `${item.journalId} business source ref missing`,
  );
  assert(types.includes("evidence"), `${item.journalId} evidence ref missing`);
  for (const ref of item.refs) {
    assert(allowedTypes.has(ref.resourceType), `unsupported source type ${ref.resourceType}`);
    assert(
      ref.href.startsWith(`/api/v1/organizations/${input.organizationId}/`),
      `${ref.id} is not organization scoped`,
    );
  }
}

const dashboardCsv = text("expected-dashboard.csv");
for (const [key, value] of Object.entries(input.dashboard)) {
  assert(dashboardCsv.includes(`${key},${value},`), `${key} expected dashboard row missing`);
}
const drilldownCsv = text("expected-drilldown.csv");
for (const item of input.drilldown.items) {
  const document = item.refs.find((ref) => ref.resourceType === "commercial_document");
  const evidence = item.refs.find((ref) => ref.resourceType === "evidence");
  assert(
    drilldownCsv.includes(
      `${item.journalId},${item.lineNumber},${item.amountMinor},${document?.id},${evidence?.id}`,
    ),
    `${item.journalId} expected drill-down row missing`,
  );
}

for (const row of text("SHA256SUMS").trim().split("\n")) {
  const match = row.match(/^([0-9a-f]{64}) {2}(.+)$/);
  assert(match, "malformed SHA256SUMS row");
  const actual = createHash("sha256")
    .update(readFileSync(join(directory, match[2])))
    .digest("hex");
  assert(actual === match[1], `${match[2]} hash mismatch`);
}
console.log("GF-DASHBOARD-001: canonical cards, exact drill-down and typed source chain verified");
