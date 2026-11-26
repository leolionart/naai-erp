import { queryPaymentEvidenceGapsReport } from "./payment-evidence-gaps.query.js";
import type { Queryable } from "./payment-evidence-queries.js";

export type PaymentEvidenceGapSummary = Readonly<{
  status: "ready" | "warning";
  nonCashThresholdMinor: string;
  recordCount: number;
  lineCount: number;
  withheldCitMinor: string;
  withheldVatMinor: string;
  reportPath: string;
}>;

export const STATEMENT_DRILLDOWN_DERIVED_LINES: Readonly<Record<string, readonly string[]>> = {
  gross_profit: ["revenue", "direct_cost"],
  operating_profit: ["revenue", "direct_cost", "opex", "operating_expense"],
  profit_before_tax: [
    "revenue",
    "direct_cost",
    "opex",
    "operating_expense",
    "other_income",
    "other_expense",
  ],
  net_profit: [
    "revenue",
    "direct_cost",
    "opex",
    "operating_expense",
    "other_income",
    "other_expense",
    "tax_expense",
    "income_tax",
  ],
};

export const STATEMENT_DRILLDOWN_ROOTS: Readonly<
  Record<string, readonly ("asset" | "liability" | "equity" | "revenue" | "expense")[]>
> = {
  assets: ["asset"],
  liabilities: ["liability"],
  ledger_equity: ["equity"],
  unclosed_earnings: ["revenue", "expense"],
  total_equity: ["equity", "revenue", "expense"],
  liabilities_and_equity: ["liability", "equity", "revenue", "expense"],
};

export async function summarizePaymentEvidenceGaps(
  pool: Queryable,
  organizationId: string,
  startsOn: string,
  endsOn: string,
): Promise<{
  summary: PaymentEvidenceGapSummary;
  byLineKey: ReadonlyMap<
    string,
    {
      paymentMethod: string;
      paidOn: string | null;
      paymentEvidenceRef: string | null;
      transactionEvidence: string;
      gapReasons: readonly string[];
      withheldCitMinor: string;
      withheldVatMinor: string;
    }
  >;
}> {
  const report = await queryPaymentEvidenceGapsReport(pool, organizationId, { startsOn, endsOn });
  const byLineKey = new Map<
    string,
    {
      paymentMethod: string;
      paidOn: string | null;
      paymentEvidenceRef: string | null;
      transactionEvidence: string;
      gapReasons: readonly string[];
      withheldCitMinor: string;
      withheldVatMinor: string;
    }
  >();
  for (const item of report.items) {
    byLineKey.set(`${item.sourceType}:${item.sourceId}:${item.lineNumber}`, {
      paymentMethod: item.paymentMethod,
      paidOn: item.paidOn,
      paymentEvidenceRef: item.paymentEvidenceRef,
      transactionEvidence: item.transactionEvidence,
      gapReasons: item.gapReasons,
      withheldCitMinor: item.withheldCitMinor,
      withheldVatMinor: item.withheldVatMinor,
    });
  }
  return {
    summary: {
      status: report.status,
      nonCashThresholdMinor: report.nonCashThresholdMinor,
      recordCount: report.counts.recordCount,
      lineCount: report.counts.lineCount,
      withheldCitMinor: report.totals.withheldCitMinor,
      withheldVatMinor: report.totals.withheldVatMinor,
      reportPath: `/api/v1/organizations/${organizationId}/reports/tax/payment-evidence-gaps`,
    },
    byLineKey,
  };
}
