import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  BalanceSheetContract,
  DirectCashFlowContract,
  ProfitAndLossContract,
  VatReconciliationContract,
} from "@naai-erp/contracts";
import { periodRange, shiftedMonth } from "./financial-statement-workspaces";
import {
  calendarRange,
  reportQuery,
  taxExceptionQuery,
} from "./financial-statements/statement-period-queries";
import {
  normalizeReport,
  normalizeTaxException,
  taxReviewQueueHref,
  vatReadinessMessage,
  vatSourceHref,
} from "./financial-statements/statement-report-normalization";

afterEach(() => {
  vi.useRealTimers();
});

const baseCutoff = {
  throughDate: "2026-06-30",
  maxPostedAt: "2026-06-30T16:59:59.999Z",
  journalCount: 4,
  lineCount: 12,
  sourceFingerprint: "fp-123",
} as const;

const baseControl = {
  controlVersion: "ledger-control-v1",
  ledgerMinor: "1000",
  reportMinor: "1000",
  differenceMinor: "0",
  status: "tied_out",
} as const;

describe("financial statement period and query helpers", () => {
  it("computes month, quarter, and year ranges and shifts anchor months via facade", () => {
    expect(periodRange("2026-02", "month")).toEqual({
      label: "2026-02",
      startsOn: "2026-02-01",
      endsOn: "2026-02-28",
    });
    expect(periodRange("2026-05", "quarter")).toEqual({
      label: "2026-Q2",
      startsOn: "2026-04-01",
      endsOn: "2026-06-30",
    });
    expect(periodRange("2026-08", "year")).toEqual({
      label: "2026",
      startsOn: "2026-01-01",
      endsOn: "2026-12-31",
    });

    expect(shiftedMonth("2026-01", "month", -1)).toBe("2025-12");
    expect(shiftedMonth("2026-05", "quarter", 1)).toBe("2026-08");
    expect(shiftedMonth("2026-05", "year", -1)).toBe("2025-05");
  });

  it("builds reportQuery for statements and omits startsOn on balance sheet", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T10:00:00.000Z"));

    expect(calendarRange("CAL-2026-02")).toEqual({
      startsOn: "2026-02-01",
      endsOn: "2026-02-28",
    });
    expect(calendarRange("current")).toEqual({
      startsOn: "2026-08-01",
      endsOn: "2026-08-15",
    });

    const pnlQuery = reportQuery(
      new URLSearchParams("periodId=CAL-2026-05&periodKind=quarter&projectId=PRJ-1"),
      "profit_and_loss",
    );
    expect(pnlQuery.get("startsOn")).toBe("2026-04-01");
    expect(pnlQuery.get("endsOn")).toBe("2026-06-30");
    expect(pnlQuery.get("framework")).toBe("TT133");
    expect(pnlQuery.get("basis")).toBe("accrual");
    expect(pnlQuery.get("projectId")).toBe("PRJ-1");

    const bsQuery = reportQuery(new URLSearchParams(), "balance_sheet", "2026-06-30");
    expect(bsQuery.has("startsOn")).toBe(false);
    expect(bsQuery.get("endsOn")).toBe("2026-06-30");

    const cfQuery = reportQuery(new URLSearchParams("basis=accrual"), "cash_flow", "CAL-2026-06");
    expect(cfQuery.get("basis")).toBe("cash");
    expect(cfQuery.get("startsOn")).toBe("2026-06-01");
    expect(cfQuery.get("endsOn")).toBe("2026-06-30");
  });

  it("populates default fields on taxExceptionQuery without overwriting explicit params", () => {
    const defaulted = taxExceptionQuery("to=2026-09-30");
    expect(defaulted.get("startsOn")).toBe("2026-01-01");
    expect(defaulted.get("endsOn")).toBe("2026-09-30");
    expect(defaulted.get("asOfInstant")).toBe("2026-09-30T16:59:59.999Z");
    expect(defaulted.get("framework")).toBe("TT133");
    expect(defaulted.get("state")).toBe("unreviewed");
  });
});

describe("financial statement and tax normalization", () => {
  it("normalizes P&L, Balance Sheet, Cash Flow, and VAT Reconciliation contracts", () => {
    const query = new URLSearchParams("framework=TT200&asOfInstant=2026-06-30T23:59:59.999Z");

    const rawPnl: ProfitAndLossContract = {
      schemaVersion: 1,
      organizationId: "org-1",
      currency: "VND",
      startsOn: "2026-01-01",
      endsOn: "2026-06-30",
      accountingBasis: "accrual_management",
      formulaVersion: "profit-and-loss-v1",
      ledgerCutoff: baseCutoff,
      status: "ready",
      revenueMinor: "5000000",
      directCostMinor: "2000000",
      grossProfitMinor: "3000000",
      operatingExpenseMinor: "1000000",
      operatingProfitMinor: "2000000",
      otherIncomeMinor: "0",
      otherExpenseMinor: "0",
      profitBeforeTaxMinor: "2000000",
      incomeTaxMinor: "400000",
      sectionFormulaNetProfitMinor: "1600000",
      netProfitMinor: "1600000",
      unclassifiedNetMinor: "0",
      rows: [],
      unclassifiedRows: [
        {
          key: "8119",
          label: "Unmapped",
          amountMinor: "0",
          accountIds: [],
          journalIds: [],
          journalLineIds: [],
          sourceIds: [],
          mappingVersionIds: [],
        },
      ],
      control: baseControl,
      confidenceFlags: [],
    };
    const pnl = normalizeReport("profit_and_loss", rawPnl, query);
    expect(pnl.final).toBe(true);
    expect(pnl.framework).toBe("TT200");
    expect(pnl.totalMinor).toBe("1600000");
    expect(pnl.unmappedAccountCodes).toEqual(["8119"]);
    expect(pnl.lines).toHaveLength(9);

    const rawBs: BalanceSheetContract = {
      schemaVersion: 1,
      organizationId: "org-1",
      currency: "VND",
      asOfDate: "2026-06-30",
      formulaVersion: "balance-sheet-v1",
      ledgerCutoff: baseCutoff,
      assetsMinor: "10000",
      liabilitiesMinor: "4000",
      ledgerEquityMinor: "5000",
      unclosedEarningsMinor: "900",
      totalEquityMinor: "5900",
      liabilitiesAndEquityMinor: "9900",
      equationDifferenceMinor: "100",
      assetRows: [],
      liabilityRows: [],
      equityRows: [],
      earningsRows: [],
      control: baseControl,
    };
    const bs = normalizeReport("balance_sheet", rawBs, query);
    expect(bs.final).toBe(false);
    expect(bs.status).toBe("invalid");
    expect(bs.equation?.balanced).toBe(false);
    expect(bs.equation?.differenceMinor).toBe("100");

    const rawCf: DirectCashFlowContract = {
      schemaVersion: 1,
      organizationId: "org-1",
      currency: "VND",
      startsOn: "2026-01-01",
      endsOn: "2026-06-30",
      formulaVersion: "direct-cash-flow-v1",
      ledgerCutoff: baseCutoff,
      status: "review_required",
      openingCashMinor: "1000",
      operatingCashFlowMinor: "500",
      investingCashFlowMinor: "-200",
      financingCashFlowMinor: "0",
      unclassifiedCashFlowMinor: "50",
      netCashFlowMinor: "350",
      closingCashMinor: "1350",
      expectedClosingCashMinor: "1350",
      movements: [],
      internalTransferJournalIds: [],
      control: baseControl,
      confidenceFlags: [
        { code: "unclassified_cash_flow", severity: "critical", sourceIds: ["src-1"] },
      ],
    };
    const cf = normalizeReport("cash_flow", rawCf, query);
    expect(cf.basis).toBe("cash");
    expect(cf.method).toBe("direct");
    expect(cf.exceptions).toEqual([{ code: "unclassified_cash_flow" }]);

    const rawVat: VatReconciliationContract = {
      schemaVersion: 1,
      organizationId: "org-1",
      currency: "VND",
      startsOn: "2026-01-01",
      endsOn: "2026-06-30",
      formulaVersion: "vat-reconciliation-v1",
      policyId: "pol-1",
      policyVersion: 1,
      status: "review_required",
      outputVatMinor: "1000000",
      inputVatMinor: "400000",
      eligibleInputVatMinor: "300000",
      ineligibleInputVatMinor: "0",
      unreviewedInputVatMinor: "100000",
      netVatPayableMinor: "700000",
      outputVatLedgerMinor: "1000000",
      inputVatLedgerMinor: "390000",
      outputDifferenceMinor: "0",
      inputDifferenceMinor: "10000",
      missingEvidenceItemIds: ["e1"],
      unreconciledItemIds: [],
      invalidTaxCodeItemIds: ["e2", "e3"],
      unreviewedItemIds: ["e4"],
      sourceIds: ["inv-1"],
      journalIds: ["j-1"],
      confidenceFlags: [],
      items: [],
    };
    const vat = normalizeReport("vat_reconciliation", rawVat, query);
    expect(vat.controls?.differenceMinor).toBe("10000");
    expect(vatReadinessMessage(vat)).toBe(
      "Còn 1 dòng VAT chưa review và 1 dòng thiếu chứng từ/đối soát và 2 dòng thiếu hoặc sai mã thuế VAT và chênh lệch đối soát 10000 minor units cần xử lý trước khi dùng số liệu như bản final.",
    );
    expect(vatSourceHref(vat)).toBe(taxReviewQueueHref(vat));
    expect(() => normalizeReport("balance_sheet", rawPnl, query)).toThrow(
      "API trả về contract báo cáo không phù hợp với route",
    );
  });

  it("normalizes raw snake_case tax expense exceptions with BigInt differences", () => {
    const normalized = normalizeTaxException({
      expense_id: "doc-42",
      line_number: 2,
      source_type: "purchase_invoice",
      expense_date: "2026-06-10",
      description: "Cloud hosting",
      party_name: "Vendor Co",
      booked_net_minor: "1000000",
      booked_gross_minor: "1100000",
      booked_vat_minor: "100000",
      cit_eligible_minor: "800000",
      vat_eligible_minor: "60000",
      cit_state: "partially_eligible",
      vat_state: "partially_eligible",
      tax_code: "VAT10_IN",
      tax_code_approved: false,
      evidence: [{ id: "ev-1" }],
      nextActions: ["review-vat", 123],
      exceptionCodes: ["VAT_CODE_UNAPPROVED"],
      sourceIds: { invoiceId: "doc-42" },
    });

    expect(normalized).toEqual({
      id: "doc-42:2",
      expenseId: "doc-42",
      sourceType: "purchase_invoice",
      lineNumber: 2,
      expenseDate: "2026-06-10",
      description: "Cloud hosting",
      partyName: "Vendor Co",
      bookedMinor: "1000000",
      vatBasisMinor: "100000",
      citEligibleMinor: "800000",
      citIneligibleMinor: "300000",
      vatEligibleMinor: "60000",
      vatIneligibleMinor: "40000",
      citState: "partially_eligible",
      vatState: "partially_eligible",
      taxCode: "VAT10_IN",
      taxCodeApproved: false,
      evidenceState: "verified",
      nextActions: ["review-vat"],
      exceptionCodes: ["VAT_CODE_UNAPPROVED"],
      sourceIds: ["doc-42"],
    });
  });
});
