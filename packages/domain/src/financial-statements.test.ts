import { describe, expect, it } from "vitest";
import {
  buildBalanceSheet,
  buildDirectCashFlow,
  buildProfitAndLoss,
  type CashFlowJournal,
  type FinancialLedgerLine,
  type FinancialRootType,
  type ProfitAndLossSection,
} from "./financial-statements.js";

const cutoff = {
  throughDate: "2026-08-31",
  maxPostedAt: "2026-08-31T16:00:00.000Z",
  journalCount: 11,
  lineCount: 22,
  sourceFingerprint: "a".repeat(64),
} as const;

let sequence = 0;
const line = (input: {
  journalId: string;
  accountId: string;
  rootType: FinancialRootType;
  debit?: bigint;
  credit?: bigint;
  entryDate?: string;
  pnlSection?: ProfitAndLossSection;
}): FinancialLedgerLine => ({
  id: `line-${++sequence}`,
  organizationId: "org-naai",
  journalId: input.journalId,
  entryDate: input.entryDate ?? "2026-08-15",
  accountId: input.accountId,
  accountName: input.accountId,
  rootType: input.rootType,
  debitMinor: input.debit ?? 0n,
  creditMinor: input.credit ?? 0n,
  sourceId: input.journalId,
  sourceType: "fixture",
  dimensions: {},
  ...(input.pnlSection ? { pnlSection: input.pnlSection, mappingVersionId: "mapping-v1" } : {}),
});

const ledger = () => [
  line({
    journalId: "opening",
    accountId: "bank",
    rootType: "asset",
    debit: 300n,
    entryDate: "2026-07-31",
  }),
  line({
    journalId: "opening",
    accountId: "capital",
    rootType: "equity",
    credit: 300n,
    entryDate: "2026-07-31",
  }),
  line({ journalId: "sale", accountId: "bank", rootType: "asset", debit: 120n }),
  line({
    journalId: "sale",
    accountId: "revenue",
    rootType: "revenue",
    credit: 100n,
    pnlSection: "revenue",
  }),
  line({ journalId: "sale", accountId: "vat-output", rootType: "liability", credit: 20n }),
  line({
    journalId: "direct",
    accountId: "direct-cost",
    rootType: "expense",
    debit: 40n,
    pnlSection: "direct_cost",
  }),
  line({ journalId: "direct", accountId: "bank", rootType: "asset", credit: 40n }),
  line({
    journalId: "opex",
    accountId: "opex",
    rootType: "expense",
    debit: 20n,
    pnlSection: "operating_expense",
  }),
  line({ journalId: "opex", accountId: "ap", rootType: "liability", credit: 20n }),
  line({ journalId: "other-income", accountId: "bank", rootType: "asset", debit: 5n }),
  line({
    journalId: "other-income",
    accountId: "other-income",
    rootType: "revenue",
    credit: 5n,
    pnlSection: "other_income",
  }),
  line({
    journalId: "other-expense",
    accountId: "other-expense",
    rootType: "expense",
    debit: 2n,
    pnlSection: "other_expense",
  }),
  line({ journalId: "other-expense", accountId: "bank", rootType: "asset", credit: 2n }),
  line({
    journalId: "income-tax",
    accountId: "income-tax",
    rootType: "expense",
    debit: 5n,
    pnlSection: "income_tax",
  }),
  line({ journalId: "income-tax", accountId: "tax-payable", rootType: "liability", credit: 5n }),
  line({ journalId: "equipment", accountId: "equipment", rootType: "asset", debit: 30n }),
  line({ journalId: "equipment", accountId: "bank", rootType: "asset", credit: 30n }),
  line({ journalId: "loan", accountId: "bank", rootType: "asset", debit: 50n }),
  line({ journalId: "loan", accountId: "loan", rootType: "liability", credit: 50n }),
  line({ journalId: "withdrawal", accountId: "drawings", rootType: "equity", debit: 10n }),
  line({ journalId: "withdrawal", accountId: "bank", rootType: "asset", credit: 10n }),
  line({ journalId: "ap-payment", accountId: "ap", rootType: "liability", debit: 20n }),
  line({ journalId: "ap-payment", accountId: "bank", rootType: "asset", credit: 20n }),
  line({ journalId: "transfer", accountId: "cash", rootType: "asset", debit: 10n }),
  line({ journalId: "transfer", accountId: "bank", rootType: "asset", credit: 10n }),
];

describe("ERP-630 financial statements", () => {
  it("builds layered accrual P&L and ties exact net profit to ledger", () => {
    const result = buildProfitAndLoss({
      organizationId: "org-naai",
      currency: "vnd",
      startsOn: "2026-08-01",
      endsOn: "2026-08-31",
      ledgerCutoff: cutoff,
      lines: ledger(),
    });
    expect(result).toMatchObject({
      currency: "VND",
      accountingBasis: "accrual_management",
      status: "ready",
      revenueMinor: 100n,
      directCostMinor: 40n,
      grossProfitMinor: 60n,
      operatingExpenseMinor: 20n,
      operatingProfitMinor: 40n,
      otherIncomeMinor: 5n,
      otherExpenseMinor: 2n,
      profitBeforeTaxMinor: 43n,
      incomeTaxMinor: 5n,
      netProfitMinor: 38n,
      control: { status: "tied_out", differenceMinor: 0n },
    });
  });

  it("keeps unclassified P&L visible and blocks readiness without losing ledger tie", () => {
    const lines = ledger().map((item) =>
      item.accountId === "opex"
        ? { ...item, pnlSection: undefined, mappingVersionId: undefined }
        : item,
    ) as FinancialLedgerLine[];
    const result = buildProfitAndLoss({
      organizationId: "org-naai",
      currency: "VND",
      startsOn: "2026-08-01",
      endsOn: "2026-08-31",
      ledgerCutoff: cutoff,
      lines,
    });
    expect(result).toMatchObject({
      status: "review_required",
      netProfitMinor: 38n,
      sectionFormulaNetProfitMinor: 58n,
      unclassifiedNetMinor: -20n,
      control: { status: "tied_out" },
    });
    expect(result.confidenceFlags[0]?.code).toBe("unclassified_profit_and_loss");
  });

  it("builds Balance Sheet with unclosed earnings and rejects any hidden plug", () => {
    const result = buildBalanceSheet({
      organizationId: "org-naai",
      currency: "VND",
      asOfDate: "2026-08-31",
      ledgerCutoff: cutoff,
      lines: ledger(),
    });
    expect(result).toMatchObject({
      assetsMinor: 403n,
      liabilitiesMinor: 75n,
      ledgerEquityMinor: 290n,
      unclosedEarningsMinor: 38n,
      totalEquityMinor: 328n,
      liabilitiesAndEquityMinor: 403n,
      equationDifferenceMinor: 0n,
      control: { status: "tied_out" },
    });
    expect(() =>
      buildBalanceSheet({
        organizationId: "org-naai",
        currency: "VND",
        asOfDate: "2026-08-31",
        ledgerCutoff: cutoff,
        lines: ledger().slice(0, -1),
      }),
    ).toThrow("source ledger is unbalanced");
  });

  it("classifies direct cash flow and excludes internal own-account transfers", () => {
    const lines = ledger();
    const byJournal = (journalId: string) => lines.filter((item) => item.journalId === journalId);
    const specifications = [
      ["sale", "customer_receipt", "operating"],
      ["direct", "supplier_payment", "operating"],
      ["other-income", "other", "operating"],
      ["other-expense", "other", "operating"],
      ["equipment", "asset_purchase", "investing"],
      ["loan", "loan_proceeds", "financing"],
      ["withdrawal", "owner_withdrawal", "financing"],
      ["ap-payment", "supplier_payment", "operating"],
      ["transfer", "internal_transfer", "internal_transfer"],
    ] as const;
    const journals: CashFlowJournal[] = specifications.map(
      ([journalId, sourceKind, classification]) => ({
        journalId,
        entryDate: "2026-08-15",
        sourceId: journalId,
        sourceKind: sourceKind as CashFlowJournal["sourceKind"],
        classification: classification as CashFlowJournal["classification"],
        mappingVersionId: "cash-map-v1",
        lines: byJournal(journalId),
      }),
    );
    const result = buildDirectCashFlow({
      organizationId: "org-naai",
      currency: "VND",
      startsOn: "2026-08-01",
      endsOn: "2026-08-31",
      ledgerCutoff: cutoff,
      cashAccountIds: ["bank", "cash"],
      openingCashMinor: 300n,
      expectedClosingCashMinor: 373n,
      journals,
    });
    expect(result).toMatchObject({
      status: "ready",
      operatingCashFlowMinor: 63n,
      investingCashFlowMinor: -30n,
      financingCashFlowMinor: 40n,
      netCashFlowMinor: 73n,
      closingCashMinor: 373n,
      control: { status: "tied_out" },
    });
    expect(result.internalTransferJournalIds).toEqual(["transfer"]);
    expect(() =>
      buildDirectCashFlow({
        organizationId: "org-naai",
        currency: "VND",
        startsOn: "2026-08-01",
        endsOn: "2026-08-31",
        ledgerCutoff: cutoff,
        cashAccountIds: ["bank"],
        openingCashMinor: 300n,
        expectedClosingCashMinor: 373n,
        journals,
      }),
    ).toThrow("Internal cash transfer must net to zero");
  });
});
