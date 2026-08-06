import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const directory = dirname(fileURLToPath(import.meta.url));
const text = (name) => readFileSync(join(directory, name), "utf8").replaceAll("\r\n", "\n");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const rows = (name) =>
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
assert(input.fixtureId === "GF-FINANCIAL-001", "Fixture identity mismatch");
const pnl = Object.fromEntries(input.pnl.map((item) => [item.section, BigInt(item.amountMinor)]));
const calculatedPnl = new Map();
calculatedPnl.set("revenue", pnl.revenue);
calculatedPnl.set("direct_cost", pnl.direct_cost);
calculatedPnl.set("gross_profit", pnl.revenue - pnl.direct_cost);
calculatedPnl.set("operating_expense", pnl.operating_expense);
calculatedPnl.set("operating_profit", calculatedPnl.get("gross_profit") - pnl.operating_expense);
calculatedPnl.set("other_income", pnl.other_income);
calculatedPnl.set("other_expense", pnl.other_expense);
calculatedPnl.set(
  "profit_before_tax",
  calculatedPnl.get("operating_profit") + pnl.other_income - pnl.other_expense,
);
calculatedPnl.set("income_tax", pnl.income_tax);
calculatedPnl.set("net_profit", calculatedPnl.get("profit_before_tax") - pnl.income_tax);
for (const [key, value] of rows("expected-profit-and-loss.csv"))
  assert(calculatedPnl.get(key) === value, `P&L ${key} mismatch`);
const sum = (items) => items.reduce((total, item) => total + BigInt(item.amountMinor), 0n);
const assets = sum(input.balanceSheet.assets),
  liabilities = sum(input.balanceSheet.liabilities),
  ledgerEquity = sum(input.balanceSheet.ledgerEquity);
const totalEquity = ledgerEquity + calculatedPnl.get("net_profit"),
  rhs = liabilities + totalEquity;
const calculatedBs = new Map([
  ["assets", assets],
  ["liabilities", liabilities],
  ["ledger_equity", ledgerEquity],
  ["unclosed_earnings", calculatedPnl.get("net_profit")],
  ["total_equity", totalEquity],
  ["liabilities_and_equity", rhs],
  ["equation_difference", assets - rhs],
]);
for (const [key, value] of rows("expected-balance-sheet.csv"))
  assert(calculatedBs.get(key) === value, `Balance Sheet ${key} mismatch`);
assert(assets === rhs, "Balance Sheet equation failed");
const flow = (section) =>
  input.cashFlow
    .filter((item) => item.classification === section)
    .reduce((total, item) => total + BigInt(item.amountMinor), 0n);
const opening = BigInt(input.openingCashMinor),
  operating = flow("operating"),
  investing = flow("investing"),
  financing = flow("financing"),
  internal = flow("internal_transfer");
const net = operating + investing + financing,
  closing = opening + net;
const calculatedCf = new Map([
  ["opening_cash", opening],
  ["operating", operating],
  ["investing", investing],
  ["financing", financing],
  ["internal_transfer", internal],
  ["net_cash_flow", net],
  ["closing_cash", closing],
]);
for (const [key, value] of rows("expected-direct-cash-flow.csv"))
  assert(calculatedCf.get(key) === value, `Cash Flow ${key} mismatch`);
assert(internal === 0n, "Own-account transfer changed cash flow");
for (const item of input.cashFlow) {
  if (
    ["capital_contribution", "loan_proceeds", "loan_repayment", "owner_withdrawal"].includes(
      item.sourceKind,
    )
  )
    assert(item.classification === "financing", `${item.sourceKind} is not financing`);
}
console.log("GF-FINANCIAL-001: P&L, Balance Sheet and direct Cash Flow verified independently");
