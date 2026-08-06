export const PROFIT_AND_LOSS_FORMULA_VERSION = "profit-and-loss-v1" as const;
export const BALANCE_SHEET_FORMULA_VERSION = "balance-sheet-v1" as const;
export const DIRECT_CASH_FLOW_FORMULA_VERSION = "direct-cash-flow-v1" as const;
export const FINANCIAL_LEDGER_CONTROL_VERSION = "ledger-control-v1" as const;

export type FinancialReportStatus = "ready" | "review_required";
export type FinancialRootType = "asset" | "liability" | "equity" | "revenue" | "expense";
export type ProfitAndLossSection =
  "revenue" | "direct_cost" | "operating_expense" | "other_income" | "other_expense" | "income_tax";
export type CashFlowSection =
  "operating" | "investing" | "financing" | "internal_transfer" | "unclassified";
export type CashFlowSourceKind =
  | "customer_receipt"
  | "supplier_payment"
  | "employee_payment"
  | "tax_payment"
  | "asset_purchase"
  | "asset_sale"
  | "capital_contribution"
  | "loan_proceeds"
  | "loan_repayment"
  | "owner_withdrawal"
  | "internal_transfer"
  | "other";

export type LedgerCutoff = Readonly<{
  throughDate: string;
  maxPostedAt: string;
  journalCount: number;
  lineCount: number;
  sourceFingerprint: string;
}>;

export type FinancialLedgerLine = Readonly<{
  id: string;
  organizationId: string;
  journalId: string;
  entryDate: string;
  accountId: string;
  accountName: string;
  rootType: FinancialRootType;
  debitMinor: bigint;
  creditMinor: bigint;
  description?: string;
  sourceId: string;
  sourceType: string;
  dimensions: Readonly<Record<string, string>>;
  pnlSection?: ProfitAndLossSection;
  mappingVersionId?: string;
}>;

export type FinancialStatementRow = Readonly<{
  key: string;
  label: string;
  amountMinor: bigint;
  accountIds: readonly string[];
  journalIds: readonly string[];
  journalLineIds: readonly string[];
  sourceIds: readonly string[];
  mappingVersionIds: readonly string[];
}>;

export type FinancialControl = Readonly<{
  controlVersion: typeof FINANCIAL_LEDGER_CONTROL_VERSION;
  ledgerMinor: bigint;
  reportMinor: bigint;
  differenceMinor: bigint;
  status: "tied_out" | "difference";
}>;

export type ProfitAndLoss = Readonly<{
  organizationId: string;
  currency: string;
  startsOn: string;
  endsOn: string;
  accountingBasis: "accrual_management";
  formulaVersion: typeof PROFIT_AND_LOSS_FORMULA_VERSION;
  ledgerCutoff: LedgerCutoff;
  status: FinancialReportStatus;
  revenueMinor: bigint;
  directCostMinor: bigint;
  grossProfitMinor: bigint;
  operatingExpenseMinor: bigint;
  operatingProfitMinor: bigint;
  otherIncomeMinor: bigint;
  otherExpenseMinor: bigint;
  profitBeforeTaxMinor: bigint;
  incomeTaxMinor: bigint;
  sectionFormulaNetProfitMinor: bigint;
  netProfitMinor: bigint;
  unclassifiedNetMinor: bigint;
  rows: readonly FinancialStatementRow[];
  unclassifiedRows: readonly FinancialStatementRow[];
  control: FinancialControl;
  confidenceFlags: readonly Readonly<{
    code: "unclassified_profit_and_loss";
    severity: "critical";
    sourceIds: readonly string[];
  }>[];
}>;

export type BalanceSheet = Readonly<{
  organizationId: string;
  currency: string;
  asOfDate: string;
  formulaVersion: typeof BALANCE_SHEET_FORMULA_VERSION;
  ledgerCutoff: LedgerCutoff;
  assetsMinor: bigint;
  liabilitiesMinor: bigint;
  ledgerEquityMinor: bigint;
  unclosedEarningsMinor: bigint;
  totalEquityMinor: bigint;
  liabilitiesAndEquityMinor: bigint;
  equationDifferenceMinor: bigint;
  assetRows: readonly FinancialStatementRow[];
  liabilityRows: readonly FinancialStatementRow[];
  equityRows: readonly FinancialStatementRow[];
  earningsRows: readonly FinancialStatementRow[];
  control: FinancialControl;
}>;

export type CashFlowJournal = Readonly<{
  journalId: string;
  entryDate: string;
  sourceId: string;
  sourceKind: CashFlowSourceKind;
  classification: CashFlowSection;
  mappingVersionId?: string;
  lines: readonly FinancialLedgerLine[];
}>;

export type DirectCashFlow = Readonly<{
  organizationId: string;
  currency: string;
  startsOn: string;
  endsOn: string;
  formulaVersion: typeof DIRECT_CASH_FLOW_FORMULA_VERSION;
  ledgerCutoff: LedgerCutoff;
  status: FinancialReportStatus;
  openingCashMinor: bigint;
  operatingCashFlowMinor: bigint;
  investingCashFlowMinor: bigint;
  financingCashFlowMinor: bigint;
  unclassifiedCashFlowMinor: bigint;
  netCashFlowMinor: bigint;
  closingCashMinor: bigint;
  expectedClosingCashMinor: bigint;
  movements: readonly FinancialStatementRow[];
  internalTransferJournalIds: readonly string[];
  control: FinancialControl;
  confidenceFlags: readonly Readonly<{
    code: "unclassified_cash_flow";
    severity: "critical";
    sourceIds: readonly string[];
  }>[];
}>;

const required = (value: string, label: string) => {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
};
const isoDate = (value: string, label: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} must be an ISO date`);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value)
    throw new Error(`${label} must be an ISO date`);
  return value;
};
const currency = (value: string) => {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) throw new Error("Financial report currency must be ISO-4217");
  return normalized;
};
const unique = (values: readonly string[]) =>
  Object.freeze([...new Set(values.map((value) => required(value, "Financial source ID")))].sort());
const validateCutoff = (value: LedgerCutoff): LedgerCutoff => {
  isoDate(value.throughDate, "Ledger cutoff date");
  if (Number.isNaN(Date.parse(value.maxPostedAt)) || !value.maxPostedAt.includes("T"))
    throw new Error("Ledger cutoff max posted time must be an ISO timestamp");
  if (!Number.isSafeInteger(value.journalCount) || value.journalCount < 0)
    throw new Error("Ledger cutoff journal count is invalid");
  if (!Number.isSafeInteger(value.lineCount) || value.lineCount < 0)
    throw new Error("Ledger cutoff line count is invalid");
  if (!/^[0-9a-f]{64}$/.test(value.sourceFingerprint))
    throw new Error("Ledger cutoff fingerprint must be SHA-256");
  return Object.freeze({ ...value });
};
const validateLine = (line: FinancialLedgerLine, organizationId: string) => {
  if (line.organizationId !== organizationId)
    throw new Error("Financial line organization mismatch");
  isoDate(line.entryDate, "Financial line date");
  if (
    line.debitMinor < 0n ||
    line.creditMinor < 0n ||
    line.debitMinor > 0n === line.creditMinor > 0n
  )
    throw new Error("Financial line must contain exactly one positive debit or credit");
  required(line.id, "Financial line ID");
  required(line.journalId, "Financial journal ID");
  required(line.accountId, "Financial account ID");
  required(line.sourceId, "Financial source ID");
};
type MutableRow = {
  amountMinor: bigint;
  accountIds: string[];
  journalIds: string[];
  journalLineIds: string[];
  sourceIds: string[];
  mappingVersionIds: string[];
};
const add = (
  map: Map<string, MutableRow>,
  key: string,
  line: FinancialLedgerLine,
  amount: bigint,
) => {
  const row = map.get(key) ?? {
    amountMinor: 0n,
    accountIds: [],
    journalIds: [],
    journalLineIds: [],
    sourceIds: [],
    mappingVersionIds: [],
  };
  row.amountMinor += amount;
  row.accountIds.push(line.accountId);
  row.journalIds.push(line.journalId);
  row.journalLineIds.push(line.id);
  row.sourceIds.push(line.sourceId);
  if (line.mappingVersionId) row.mappingVersionIds.push(line.mappingVersionId);
  map.set(key, row);
};
const rows = (map: Map<string, MutableRow>): readonly FinancialStatementRow[] =>
  Object.freeze(
    [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, row]) =>
        Object.freeze({
          key,
          label: key,
          amountMinor: row.amountMinor,
          accountIds: unique(row.accountIds),
          journalIds: unique(row.journalIds),
          journalLineIds: unique(row.journalLineIds),
          sourceIds: unique(row.sourceIds),
          mappingVersionIds: unique(row.mappingVersionIds),
        }),
      ),
  );
const control = (ledgerMinor: bigint, reportMinor: bigint): FinancialControl => {
  const differenceMinor = ledgerMinor - reportMinor;
  return Object.freeze({
    controlVersion: FINANCIAL_LEDGER_CONTROL_VERSION,
    ledgerMinor,
    reportMinor,
    differenceMinor,
    status: differenceMinor === 0n ? "tied_out" : "difference",
  });
};

export function buildProfitAndLoss(
  input: Readonly<{
    organizationId: string;
    currency: string;
    startsOn: string;
    endsOn: string;
    ledgerCutoff: LedgerCutoff;
    lines: readonly FinancialLedgerLine[];
  }>,
): ProfitAndLoss {
  const organizationId = required(input.organizationId, "P&L organization ID");
  const startsOn = isoDate(input.startsOn, "P&L start date");
  const endsOn = isoDate(input.endsOn, "P&L end date");
  if (startsOn > endsOn) throw new Error("P&L period is invalid");
  const cutoff = validateCutoff(input.ledgerCutoff);
  if (cutoff.throughDate !== endsOn) throw new Error("P&L cutoff must equal period end");
  const sectionMaps = new Map<ProfitAndLossSection, Map<string, MutableRow>>();
  const unclassified = new Map<string, MutableRow>();
  const totals = new Map<ProfitAndLossSection, bigint>();
  let ledgerNetProfitMinor = 0n;
  for (const line of input.lines) {
    validateLine(line, organizationId);
    if (line.entryDate < startsOn || line.entryDate > endsOn) continue;
    if (!(["revenue", "expense"] as const).includes(line.rootType as "revenue" | "expense"))
      continue;
    const amount =
      line.rootType === "revenue"
        ? line.creditMinor - line.debitMinor
        : line.debitMinor - line.creditMinor;
    ledgerNetProfitMinor += line.rootType === "revenue" ? amount : -amount;
    const section = line.pnlSection;
    const valid =
      section &&
      (line.rootType === "revenue"
        ? ["revenue", "other_income"].includes(section)
        : ["direct_cost", "operating_expense", "other_expense", "income_tax"].includes(section));
    if (!valid) {
      add(unclassified, line.accountId, line, line.rootType === "revenue" ? amount : -amount);
      continue;
    }
    const map = sectionMaps.get(section) ?? new Map<string, MutableRow>();
    add(map, line.accountId, line, amount);
    sectionMaps.set(section, map);
    totals.set(section, (totals.get(section) ?? 0n) + amount);
  }
  const value = (section: ProfitAndLossSection) => totals.get(section) ?? 0n;
  const revenueMinor = value("revenue");
  const directCostMinor = value("direct_cost");
  const grossProfitMinor = revenueMinor - directCostMinor;
  const operatingExpenseMinor = value("operating_expense");
  const operatingProfitMinor = grossProfitMinor - operatingExpenseMinor;
  const otherIncomeMinor = value("other_income");
  const otherExpenseMinor = value("other_expense");
  const profitBeforeTaxMinor = operatingProfitMinor + otherIncomeMinor - otherExpenseMinor;
  const incomeTaxMinor = value("income_tax");
  const sectionFormulaNetProfitMinor = profitBeforeTaxMinor - incomeTaxMinor;
  const unclassifiedRows = rows(unclassified);
  const unclassifiedNetMinor = unclassifiedRows.reduce((sum, row) => sum + row.amountMinor, 0n);
  const sectionOrder: readonly ProfitAndLossSection[] = [
    "revenue",
    "direct_cost",
    "operating_expense",
    "other_income",
    "other_expense",
    "income_tax",
  ];
  const statementRows = Object.freeze(
    sectionOrder.flatMap((section) =>
      rows(sectionMaps.get(section) ?? new Map()).map((row) =>
        Object.freeze({ ...row, key: `${section}:${row.key}` }),
      ),
    ),
  );
  const reportControl = control(
    ledgerNetProfitMinor,
    sectionFormulaNetProfitMinor + unclassifiedNetMinor,
  );
  if (reportControl.status !== "tied_out") throw new Error("P&L does not tie to ledger");
  return Object.freeze({
    organizationId,
    currency: currency(input.currency),
    startsOn,
    endsOn,
    accountingBasis: "accrual_management",
    formulaVersion: PROFIT_AND_LOSS_FORMULA_VERSION,
    ledgerCutoff: cutoff,
    status: unclassifiedRows.length ? "review_required" : "ready",
    revenueMinor,
    directCostMinor,
    grossProfitMinor,
    operatingExpenseMinor,
    operatingProfitMinor,
    otherIncomeMinor,
    otherExpenseMinor,
    profitBeforeTaxMinor,
    incomeTaxMinor,
    sectionFormulaNetProfitMinor,
    netProfitMinor: ledgerNetProfitMinor,
    unclassifiedNetMinor,
    rows: statementRows,
    unclassifiedRows,
    control: reportControl,
    confidenceFlags: unclassifiedRows.length
      ? [
          Object.freeze({
            code: "unclassified_profit_and_loss" as const,
            severity: "critical" as const,
            sourceIds: unique(unclassifiedRows.flatMap((row) => row.sourceIds)),
          }),
        ]
      : [],
  });
}

export function buildBalanceSheet(
  input: Readonly<{
    organizationId: string;
    currency: string;
    asOfDate: string;
    ledgerCutoff: LedgerCutoff;
    lines: readonly FinancialLedgerLine[];
  }>,
): BalanceSheet {
  const organizationId = required(input.organizationId, "Balance Sheet organization ID");
  const asOfDate = isoDate(input.asOfDate, "Balance Sheet date");
  const cutoff = validateCutoff(input.ledgerCutoff);
  if (cutoff.throughDate !== asOfDate)
    throw new Error("Balance Sheet cutoff must equal as-of date");
  const maps = {
    asset: new Map<string, MutableRow>(),
    liability: new Map<string, MutableRow>(),
    equity: new Map<string, MutableRow>(),
    earnings: new Map<string, MutableRow>(),
  };
  let debits = 0n,
    credits = 0n;
  for (const line of input.lines) {
    validateLine(line, organizationId);
    if (line.entryDate > asOfDate) continue;
    debits += line.debitMinor;
    credits += line.creditMinor;
    if (line.rootType === "asset")
      add(maps.asset, line.accountId, line, line.debitMinor - line.creditMinor);
    else if (line.rootType === "liability")
      add(maps.liability, line.accountId, line, line.creditMinor - line.debitMinor);
    else if (line.rootType === "equity")
      add(maps.equity, line.accountId, line, line.creditMinor - line.debitMinor);
    else if (line.rootType === "revenue")
      add(maps.earnings, line.accountId, line, line.creditMinor - line.debitMinor);
    else add(maps.earnings, line.accountId, line, -(line.debitMinor - line.creditMinor));
  }
  if (debits !== credits) throw new Error("Balance Sheet source ledger is unbalanced");
  const assetRows = rows(maps.asset),
    liabilityRows = rows(maps.liability),
    equityRows = rows(maps.equity),
    earningsRows = rows(maps.earnings);
  const sum = (values: readonly FinancialStatementRow[]) =>
    values.reduce((total, row) => total + row.amountMinor, 0n);
  const assetsMinor = sum(assetRows),
    liabilitiesMinor = sum(liabilityRows),
    ledgerEquityMinor = sum(equityRows),
    unclosedEarningsMinor = sum(earningsRows),
    totalEquityMinor = ledgerEquityMinor + unclosedEarningsMinor,
    liabilitiesAndEquityMinor = liabilitiesMinor + totalEquityMinor,
    equationDifferenceMinor = assetsMinor - liabilitiesAndEquityMinor;
  if (equationDifferenceMinor !== 0n)
    throw new Error(`Balance Sheet equation mismatch: ${equationDifferenceMinor}`);
  return Object.freeze({
    organizationId,
    currency: currency(input.currency),
    asOfDate,
    formulaVersion: BALANCE_SHEET_FORMULA_VERSION,
    ledgerCutoff: cutoff,
    assetsMinor,
    liabilitiesMinor,
    ledgerEquityMinor,
    unclosedEarningsMinor,
    totalEquityMinor,
    liabilitiesAndEquityMinor,
    equationDifferenceMinor,
    assetRows,
    liabilityRows,
    equityRows,
    earningsRows,
    control: control(assetsMinor, liabilitiesAndEquityMinor),
  });
}

export function buildDirectCashFlow(
  input: Readonly<{
    organizationId: string;
    currency: string;
    startsOn: string;
    endsOn: string;
    ledgerCutoff: LedgerCutoff;
    cashAccountIds: readonly string[];
    openingCashMinor: bigint;
    expectedClosingCashMinor: bigint;
    journals: readonly CashFlowJournal[];
  }>,
): DirectCashFlow {
  const organizationId = required(input.organizationId, "Cash Flow organization ID");
  const startsOn = isoDate(input.startsOn, "Cash Flow start date"),
    endsOn = isoDate(input.endsOn, "Cash Flow end date");
  if (startsOn > endsOn) throw new Error("Cash Flow period is invalid");
  const cutoff = validateCutoff(input.ledgerCutoff);
  if (cutoff.throughDate !== endsOn) throw new Error("Cash Flow cutoff must equal period end");
  const cashAccounts = new Set(unique(input.cashAccountIds));
  if (!cashAccounts.size) throw new Error("Cash Flow requires at least one cash account");
  const movementMap = new Map<string, MutableRow>();
  const internalTransferJournalIds: string[] = [];
  const totals = new Map<CashFlowSection, bigint>();
  for (const journal of input.journals) {
    required(journal.journalId, "Cash Flow journal ID");
    const cashLines = journal.lines.filter((line) => {
      validateLine(line, organizationId);
      return cashAccounts.has(line.accountId);
    });
    if (!cashLines.length || journal.entryDate < startsOn || journal.entryDate > endsOn) continue;
    const amount = cashLines.reduce((sum, line) => sum + line.debitMinor - line.creditMinor, 0n);
    if (journal.classification === "internal_transfer") {
      if (journal.sourceKind !== "internal_transfer")
        throw new Error("Internal cash-flow classification requires internal-transfer source");
      if (amount !== 0n) throw new Error("Internal cash transfer must net to zero");
      internalTransferJournalIds.push(journal.journalId);
      continue;
    }
    if (journal.sourceKind === "internal_transfer")
      throw new Error("Internal-transfer source must use internal cash-flow classification");
    if (
      ["capital_contribution", "loan_proceeds", "loan_repayment", "owner_withdrawal"].includes(
        journal.sourceKind,
      ) &&
      journal.classification !== "financing"
    )
      throw new Error("Capital, loan and owner movements must be financing cash flow");
    if (amount === 0n) continue;
    const seed = cashLines[0]!;
    const synthetic: FinancialLedgerLine = {
      ...seed,
      id: cashLines.map((line) => line.id).join("+"),
      sourceId: journal.sourceId,
      ...(journal.mappingVersionId ? { mappingVersionId: journal.mappingVersionId } : {}),
    };
    add(movementMap, `${journal.classification}:${journal.journalId}`, synthetic, amount);
    totals.set(journal.classification, (totals.get(journal.classification) ?? 0n) + amount);
  }
  const operatingCashFlowMinor = totals.get("operating") ?? 0n,
    investingCashFlowMinor = totals.get("investing") ?? 0n,
    financingCashFlowMinor = totals.get("financing") ?? 0n,
    unclassifiedCashFlowMinor = totals.get("unclassified") ?? 0n,
    netCashFlowMinor =
      operatingCashFlowMinor +
      investingCashFlowMinor +
      financingCashFlowMinor +
      unclassifiedCashFlowMinor,
    closingCashMinor = input.openingCashMinor + netCashFlowMinor;
  if (closingCashMinor !== input.expectedClosingCashMinor)
    throw new Error(
      `Cash Flow closing balance mismatch: ${closingCashMinor - input.expectedClosingCashMinor}`,
    );
  const movements = rows(movementMap);
  const unclassified = movements.filter((row) => row.key.startsWith("unclassified:"));
  return Object.freeze({
    organizationId,
    currency: currency(input.currency),
    startsOn,
    endsOn,
    formulaVersion: DIRECT_CASH_FLOW_FORMULA_VERSION,
    ledgerCutoff: cutoff,
    status: unclassified.length ? "review_required" : "ready",
    openingCashMinor: input.openingCashMinor,
    operatingCashFlowMinor,
    investingCashFlowMinor,
    financingCashFlowMinor,
    unclassifiedCashFlowMinor,
    netCashFlowMinor,
    closingCashMinor,
    expectedClosingCashMinor: input.expectedClosingCashMinor,
    movements,
    internalTransferJournalIds: unique(internalTransferJournalIds),
    control: control(input.expectedClosingCashMinor, closingCashMinor),
    confidenceFlags: unclassified.length
      ? [
          Object.freeze({
            code: "unclassified_cash_flow" as const,
            severity: "critical" as const,
            sourceIds: unique(unclassified.flatMap((row) => row.sourceIds)),
          }),
        ]
      : [],
  });
}
