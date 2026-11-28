import type {
  FinancialStatementKind,
  FinancialStatementLine,
  FinancialStatementReport,
  RawFinancialStatementReport,
  TaxExpenseException,
} from "@/lib/api";
import { today } from "./statement-period-queries";

export const statementLine = (
  statement: FinancialStatementKind,
  lineCode: string,
  label: string,
  amountMinor: string,
  sourceLineIds: readonly string[] = [],
): FinancialStatementLine => ({
  lineCode,
  label,
  amountMinor,
  sourceLineIds,
  sourceLineCount: sourceLineIds.length,
  drillDown: { statement, lineCode },
});

export function normalizeReport(
  kind: FinancialStatementKind,
  raw: RawFinancialStatementReport | FinancialStatementReport,
  query: URLSearchParams,
): FinancialStatementReport {
  if ("statement" in raw) return raw;
  const framework = (query.get("framework") === "TT200" ? "TT200" : "TT133") as "TT133" | "TT200";
  const asOfInstant = query.get("asOfInstant") ?? `${today()}T16:59:59.999Z`;
  const startsOn = "startsOn" in raw ? raw.startsOn : null;
  const endsOn = "endsOn" in raw ? raw.endsOn : raw.asOfDate;
  const common = {
    statement: kind,
    basis: kind === "cash_flow" ? "cash" : kind === "profit_and_loss" ? "accrual" : "accrual",
    range: { startsOn, endsOn },
    asOfInstant,
    framework,
    formulaVersion: raw.formulaVersion,
    mappingVersion: { id: "approved-mapping", version: 1 },
    sourceFingerprint: "ledgerCutoff" in raw ? raw.ledgerCutoff.sourceFingerprint : "",
    sourceLineCount: "ledgerCutoff" in raw ? raw.ledgerCutoff.lineCount : raw.sourceIds.length,
  } as const;
  if (kind === "profit_and_loss" && "netProfitMinor" in raw) {
    return {
      ...common,
      final: raw.status === "ready",
      status: raw.status,
      lines: [
        statementLine(kind, "revenue", "Doanh thu", raw.revenueMinor),
        statementLine(kind, "direct_cost", "Chi phí trực tiếp", raw.directCostMinor),
        statementLine(kind, "gross_profit", "Gross profit", raw.grossProfitMinor),
        statementLine(kind, "opex", "OPEX", raw.operatingExpenseMinor),
        statementLine(kind, "operating_profit", "Operating profit", raw.operatingProfitMinor),
        statementLine(kind, "other_income", "Thu nhập khác", raw.otherIncomeMinor),
        statementLine(kind, "other_expense", "Chi phí khác", raw.otherExpenseMinor),
        statementLine(kind, "tax_expense", "Thuế thu nhập", raw.incomeTaxMinor),
        statementLine(kind, "net_profit", "Net profit", raw.netProfitMinor),
      ],
      totalMinor: raw.netProfitMinor,
      unmappedAccountCodes: raw.unclassifiedRows.map((row) => row.key),
    };
  }
  if (kind === "balance_sheet" && "equationDifferenceMinor" in raw) {
    return {
      ...common,
      final: raw.equationDifferenceMinor === "0",
      status: raw.equationDifferenceMinor === "0" ? "ready" : "invalid",
      lines: [
        statementLine(kind, "assets", "Tổng tài sản", raw.assetsMinor),
        statementLine(kind, "liabilities", "Nợ phải trả", raw.liabilitiesMinor),
        statementLine(kind, "ledger_equity", "Vốn góp / equity đã ghi sổ", raw.ledgerEquityMinor),
        statementLine(
          kind,
          "unclosed_earnings",
          "Lợi nhuận chưa kết chuyển",
          raw.unclosedEarningsMinor,
        ),
        statementLine(kind, "total_equity", "Tổng vốn chủ sở hữu", raw.totalEquityMinor),
      ],
      equation: {
        assetsMinor: raw.assetsMinor,
        liabilitiesMinor: raw.liabilitiesMinor,
        equityMinor: raw.totalEquityMinor,
        differenceMinor: raw.equationDifferenceMinor,
        balanced: raw.equationDifferenceMinor === "0",
      },
    };
  }
  if (kind === "cash_flow" && "netCashFlowMinor" in raw) {
    return {
      ...common,
      basis: "cash",
      method: "direct",
      final: raw.status === "ready",
      status: raw.status,
      lines: [
        statementLine(kind, "opening_cash", "Opening cash", raw.openingCashMinor),
        statementLine(kind, "operating", "Operating cash flow", raw.operatingCashFlowMinor),
        statementLine(kind, "investing", "Investing cash flow", raw.investingCashFlowMinor),
        statementLine(kind, "financing", "Financing cash flow", raw.financingCashFlowMinor),
        statementLine(
          kind,
          "unclassified",
          "Unclassified cash flow",
          raw.unclassifiedCashFlowMinor,
        ),
        statementLine(kind, "net_cash_flow", "Net cash movement", raw.netCashFlowMinor),
        statementLine(kind, "closing_cash", "Closing cash", raw.closingCashMinor),
      ],
      openingCashMinor: raw.openingCashMinor,
      operatingCashFlowMinor: raw.operatingCashFlowMinor,
      investingCashFlowMinor: raw.investingCashFlowMinor,
      financingCashFlowMinor: raw.financingCashFlowMinor,
      netCashMovementMinor: raw.netCashFlowMinor,
      closingCashMinor: raw.closingCashMinor,
      exceptions: raw.confidenceFlags.map((flag) => ({ code: flag.code })),
    };
  }
  if (kind === "vat_reconciliation" && "netVatPayableMinor" in raw) {
    return {
      ...common,
      final: raw.status === "ready",
      status: raw.status,
      lines: [
        statementLine(kind, "output_vat", "VAT đầu ra", raw.outputVatMinor, raw.sourceIds),
        statementLine(kind, "input_vat", "VAT đầu vào", raw.inputVatMinor, raw.sourceIds),
        statementLine(
          kind,
          "eligible_input_vat",
          "Input VAT đủ điều kiện",
          raw.eligibleInputVatMinor,
          raw.sourceIds,
        ),
        statementLine(
          kind,
          "ineligible_input_vat",
          "Input VAT không đủ điều kiện",
          raw.ineligibleInputVatMinor,
          raw.sourceIds,
        ),
        statementLine(
          kind,
          "unreviewed_input_vat",
          "Input VAT chưa review",
          raw.unreviewedInputVatMinor,
          raw.sourceIds,
        ),
        statementLine(
          kind,
          "net_vat_payable",
          "VAT phải nộp / (được khấu trừ)",
          raw.netVatPayableMinor,
          raw.sourceIds,
        ),
      ],
      totals: {
        outputVatMinor: raw.outputVatMinor,
        inputVatMinor: raw.inputVatMinor,
        eligibleInputVatMinor: raw.eligibleInputVatMinor,
        ineligibleInputVatMinor: raw.ineligibleInputVatMinor,
        unreviewedInputVatMinor: raw.unreviewedInputVatMinor,
        netVatPayableMinor: raw.netVatPayableMinor,
      },
      controls: {
        unreviewedExpenseLineCount: String(raw.unreviewedItemIds.length),
        missingEvidenceExpenseCount: String(raw.missingEvidenceItemIds.length),
        invalidTaxCodeLineCount: String(raw.invalidTaxCodeItemIds.length),
        differenceMinor: (
          BigInt(raw.outputDifferenceMinor) + BigInt(raw.inputDifferenceMinor)
        ).toString(),
      },
      items: raw.items ?? [],
    };
  }
  throw new Error("API trả về contract báo cáo không phù hợp với route");
}

export function taxReviewQueueHref(report: FinancialStatementReport) {
  const params = new URLSearchParams({
    state: "exception",
    endsOn: report.range.endsOn,
    framework: report.framework,
  });
  if (report.range.startsOn) params.set("startsOn", report.range.startsOn);
  return `/reports/tax/expense-exceptions?${params.toString()}`;
}

export function vatSourceHref(report: FinancialStatementReport) {
  return report.items?.length ? "#vat-source-items" : taxReviewQueueHref(report);
}

export function vatReadinessMessage(report: FinancialStatementReport) {
  const unreviewed = Number(report.controls?.unreviewedExpenseLineCount ?? "0");
  const missingEvidence = Number(report.controls?.missingEvidenceExpenseCount ?? "0");
  const invalidTaxCodes = Number(report.controls?.invalidTaxCodeLineCount ?? "0");
  const differenceMinor = report.controls?.differenceMinor ?? "0";
  const blockers: string[] = [];
  if (unreviewed > 0) blockers.push(`${unreviewed} dòng VAT chưa review`);
  if (missingEvidence > 0) blockers.push(`${missingEvidence} dòng thiếu chứng từ/đối soát`);
  if (invalidTaxCodes > 0) blockers.push(`${invalidTaxCodes} dòng thiếu hoặc sai mã thuế VAT`);
  if (differenceMinor !== "0") blockers.push(`chênh lệch đối soát ${differenceMinor} minor units`);
  return blockers.length
    ? `Còn ${blockers.join(" và ")} cần xử lý trước khi dùng số liệu như bản final.`
    : "Còn exception VAT cần xử lý trước khi dùng số liệu như bản final.";
}

export function normalizeTaxException(value: unknown): TaxExpenseException {
  const item = value as Record<string, unknown>;
  if ("bookedMinor" in item) return item as TaxExpenseException;
  const source = (item.sourceIds ?? {}) as Record<string, unknown>;
  const evidence = Array.isArray(item.evidence) ? item.evidence : [];
  return {
    id: String(item.id ?? `${item.expense_id ?? "expense"}:${item.line_number ?? "line"}`),
    expenseId: String(item.expense_id ?? source.expenseId ?? ""),
    ...(item.source_type === "purchase_invoice" || item.expense_class === "invoice_backed"
      ? { sourceType: "purchase_invoice" as const }
      : { sourceType: "expense" as const }),
    ...(item.line_number !== undefined ? { lineNumber: Number(item.line_number) } : {}),
    expenseDate: String(item.expense_date ?? ""),
    description: String(item.description ?? "Chi phí cần rà soát"),
    ...(item.party_name ? { partyName: String(item.party_name) } : {}),
    // CIT basis is net expense; VAT is tracked separately below.
    bookedMinor: String(item.booked_net_minor ?? item.booked_gross_minor ?? "0"),
    vatBasisMinor: String(item.booked_vat_minor ?? "0"),
    citEligibleMinor: String(item.cit_eligible_minor ?? "0"),
    citIneligibleMinor: (
      BigInt(String(item.booked_gross_minor ?? "0")) -
      BigInt(String(item.cit_eligible_minor ?? "0"))
    ).toString(),
    vatEligibleMinor: String(item.vat_eligible_minor ?? "0"),
    vatIneligibleMinor: (
      BigInt(String(item.booked_vat_minor ?? "0")) - BigInt(String(item.vat_eligible_minor ?? "0"))
    ).toString(),
    citState: String(item.cit_state ?? "unreviewed"),
    vatState: String(item.vat_state ?? "unreviewed"),
    ...(item.tax_code ? { taxCode: String(item.tax_code) } : {}),
    ...(item.tax_code_approved !== undefined
      ? { taxCodeApproved: Boolean(item.tax_code_approved) }
      : {}),
    evidenceState: evidence.length ? "verified" : "missing",
    ...(item.paperless_url ? { paperlessUrl: String(item.paperless_url) } : {}),
    ...(item.reviewed_by ? { reviewer: String(item.reviewed_by) } : {}),
    ...(item.review_reason ? { reason: String(item.review_reason) } : {}),
    ...(Array.isArray(item.nextActions)
      ? {
          nextActions: item.nextActions.filter(
            (value): value is string => typeof value === "string",
          ),
        }
      : {}),
    ...(Array.isArray(item.exceptionCodes)
      ? {
          exceptionCodes: item.exceptionCodes.filter(
            (value): value is string => typeof value === "string",
          ),
        }
      : {}),
    sourceIds: Object.values(source).filter((value): value is string => typeof value === "string"),
  };
}
