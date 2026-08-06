import { describe, expect, it } from "vitest";
import {
  FINANCIAL_STATEMENT_CONTRACT_VERSION,
  type BalanceSheetContract,
  type DirectCashFlowContract,
  type ProfitAndLossContract,
} from "./index.js";

const cutoff = {
  throughDate: "2026-08-31",
  maxPostedAt: "2026-08-31T16:00:00Z",
  journalCount: 10,
  lineCount: 20,
  sourceFingerprint: "a".repeat(64),
};
const control = {
  controlVersion: "ledger-control-v1" as const,
  ledgerMinor: "38",
  reportMinor: "38",
  differenceMinor: "0",
  status: "tied_out" as const,
};

describe("ERP-630 financial statement contracts", () => {
  it("keeps all statement money exact and JSON safe", () => {
    const pnl = {
      schemaVersion: FINANCIAL_STATEMENT_CONTRACT_VERSION,
      organizationId: "org-naai",
      currency: "VND",
      startsOn: "2026-08-01",
      endsOn: "2026-08-31",
      accountingBasis: "accrual_management",
      formulaVersion: "profit-and-loss-v1",
      ledgerCutoff: cutoff,
      status: "ready",
      revenueMinor: "100",
      directCostMinor: "40",
      grossProfitMinor: "60",
      operatingExpenseMinor: "20",
      operatingProfitMinor: "40",
      otherIncomeMinor: "5",
      otherExpenseMinor: "2",
      profitBeforeTaxMinor: "43",
      incomeTaxMinor: "5",
      sectionFormulaNetProfitMinor: "38",
      netProfitMinor: "38",
      unclassifiedNetMinor: "0",
      rows: [],
      unclassifiedRows: [],
      control,
      confidenceFlags: [],
    } satisfies ProfitAndLossContract;
    const balance = {
      schemaVersion: 1,
      organizationId: "org-naai",
      currency: "VND",
      asOfDate: "2026-08-31",
      formulaVersion: "balance-sheet-v1",
      ledgerCutoff: cutoff,
      assetsMinor: "403",
      liabilitiesMinor: "75",
      ledgerEquityMinor: "290",
      unclosedEarningsMinor: "38",
      totalEquityMinor: "328",
      liabilitiesAndEquityMinor: "403",
      equationDifferenceMinor: "0",
      assetRows: [],
      liabilityRows: [],
      equityRows: [],
      earningsRows: [],
      control: { ...control, ledgerMinor: "403", reportMinor: "403" },
    } satisfies BalanceSheetContract;
    const cash = {
      schemaVersion: 1,
      organizationId: "org-naai",
      currency: "VND",
      startsOn: "2026-08-01",
      endsOn: "2026-08-31",
      formulaVersion: "direct-cash-flow-v1",
      ledgerCutoff: cutoff,
      status: "ready",
      openingCashMinor: "300",
      operatingCashFlowMinor: "63",
      investingCashFlowMinor: "-30",
      financingCashFlowMinor: "40",
      unclassifiedCashFlowMinor: "0",
      netCashFlowMinor: "73",
      closingCashMinor: "373",
      expectedClosingCashMinor: "373",
      movements: [],
      internalTransferJournalIds: ["transfer"],
      control: { ...control, ledgerMinor: "373", reportMinor: "373" },
      confidenceFlags: [],
    } satisfies DirectCashFlowContract;
    expect([pnl.netProfitMinor, balance.assetsMinor, cash.closingCashMinor]).toEqual([
      "38",
      "403",
      "373",
    ]);
  });
});
