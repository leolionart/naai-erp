import type { JournalDimensions, JournalEntry, JournalLine } from "./journal.js";
import { currencyCode, type CurrencyCode } from "./organization-setup.js";
import { organizationId, type OrganizationId } from "./organization.js";

export type LedgerJournalRecord = JournalEntry &
  Readonly<{
    sourceDocumentId?: string;
  }>;

export type LedgerDrilldown = Readonly<{
  journalId: string;
  journalLineId: string;
  sourceId: string;
  sourceKind: "document" | "journal";
  entryDate: string;
  dimensions: JournalDimensions;
}>;

export type TrialBalanceRow = Readonly<{
  accountId: string;
  openingNetMinor: bigint;
  debitMinor: bigint;
  creditMinor: bigint;
  closingNetMinor: bigint;
  drilldown: readonly LedgerDrilldown[];
}>;

export type TrialBalance = Readonly<{
  organizationId: OrganizationId;
  baseCurrency: CurrencyCode;
  startsOn: string;
  endsOn: string;
  rows: readonly TrialBalanceRow[];
  openingNetMinor: bigint;
  debitMinor: bigint;
  creditMinor: bigint;
  closingNetMinor: bigint;
}>;

export type GeneralLedgerEntry = Readonly<{
  journalId: string;
  journalLineId: string;
  entryDate: string;
  description: string;
  debitMinor: bigint;
  creditMinor: bigint;
  runningBalanceMinor: bigint;
  sourceId: string;
  sourceKind: "document" | "journal";
  dimensions: JournalDimensions;
}>;

export type GeneralLedger = Readonly<{
  organizationId: OrganizationId;
  accountId: string;
  baseCurrency: CurrencyCode;
  startsOn: string;
  endsOn: string;
  openingBalanceMinor: bigint;
  closingBalanceMinor: bigint;
  entries: readonly GeneralLedgerEntry[];
}>;

export type OpeningBalanceLine = Readonly<{
  id: string;
  accountId: string;
  debitMinor?: bigint;
  creditMinor?: bigint;
  controlAccount?: "ar" | "ap";
  partyId?: string;
  documentReference?: string;
  dimensions?: JournalDimensions;
}>;

export type ValidatedOpeningBalances = Readonly<{
  organizationId: OrganizationId;
  baseCurrency: CurrencyCode;
  effectiveOn: string;
  approvedBy: string;
  approvedAt: string;
  expectedDebitMinor: bigint;
  expectedCreditMinor: bigint;
  lines: readonly Readonly<
    Required<Pick<OpeningBalanceLine, "id" | "accountId">> & {
      debitMinor: bigint;
      creditMinor: bigint;
      controlAccount?: "ar" | "ap";
      partyId?: string;
      documentReference?: string;
      dimensions: JournalDimensions;
    }
  >[];
}>;

function required(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function isoDate(value: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`${label} must be an ISO date`);
  }
  return value;
}

function reportable(journal: LedgerJournalRecord): boolean {
  return journal.state === "posted" || journal.state === "reversed";
}

function source(journal: LedgerJournalRecord): Pick<LedgerDrilldown, "sourceId" | "sourceKind"> {
  return journal.sourceDocumentId
    ? { sourceId: journal.sourceDocumentId, sourceKind: "document" }
    : { sourceId: journal.id, sourceKind: "journal" };
}

function eligibleJournals(input: {
  journals: readonly LedgerJournalRecord[];
  organizationId: string;
  baseCurrency: string;
  throughDate: string;
}): readonly LedgerJournalRecord[] {
  const orgId = organizationId(input.organizationId);
  const baseCurrency = currencyCode(input.baseCurrency);
  const candidates = input.journals.filter(
    (journal) =>
      journal.organizationId === orgId &&
      reportable(journal) &&
      journal.entryDate <= input.throughDate,
  );
  const foreignCurrency = candidates.find((journal) => journal.baseCurrency !== baseCurrency);
  if (foreignCurrency) throw new Error("Ledger report contains a different base currency");
  return candidates;
}

function drilldown(journal: LedgerJournalRecord, line: JournalLine): LedgerDrilldown {
  return Object.freeze({
    journalId: journal.id,
    journalLineId: line.id,
    ...source(journal),
    entryDate: journal.entryDate,
    dimensions: line.dimensions,
  });
}

export function buildTrialBalance(input: {
  journals: readonly LedgerJournalRecord[];
  organizationId: string;
  baseCurrency: string;
  startsOn: string;
  endsOn: string;
}): TrialBalance {
  const startsOn = isoDate(input.startsOn, "Trial Balance start date");
  const endsOn = isoDate(input.endsOn, "Trial Balance end date");
  if (endsOn < startsOn) throw new Error("Trial Balance end date cannot precede start date");
  const journals = eligibleJournals({ ...input, throughDate: endsOn });
  const rows = new Map<
    string,
    {
      openingNetMinor: bigint;
      debitMinor: bigint;
      creditMinor: bigint;
      drilldown: LedgerDrilldown[];
    }
  >();
  for (const journal of journals) {
    for (const line of journal.lines) {
      const row = rows.get(line.accountId) ?? {
        openingNetMinor: 0n,
        debitMinor: 0n,
        creditMinor: 0n,
        drilldown: [],
      };
      if (journal.entryDate < startsOn) {
        row.openingNetMinor += line.debitMinor - line.creditMinor;
      } else {
        row.debitMinor += line.debitMinor;
        row.creditMinor += line.creditMinor;
        row.drilldown.push(drilldown(journal, line));
      }
      rows.set(line.accountId, row);
    }
  }
  const resultRows = [...rows.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map<TrialBalanceRow>(([accountId, row]) =>
      Object.freeze({
        accountId,
        openingNetMinor: row.openingNetMinor,
        debitMinor: row.debitMinor,
        creditMinor: row.creditMinor,
        closingNetMinor: row.openingNetMinor + row.debitMinor - row.creditMinor,
        drilldown: Object.freeze(row.drilldown),
      }),
    );
  const totals = resultRows.reduce(
    (sum, row) => ({
      openingNetMinor: sum.openingNetMinor + row.openingNetMinor,
      debitMinor: sum.debitMinor + row.debitMinor,
      creditMinor: sum.creditMinor + row.creditMinor,
      closingNetMinor: sum.closingNetMinor + row.closingNetMinor,
    }),
    { openingNetMinor: 0n, debitMinor: 0n, creditMinor: 0n, closingNetMinor: 0n },
  );
  if (
    totals.openingNetMinor !== 0n ||
    totals.debitMinor !== totals.creditMinor ||
    totals.closingNetMinor !== 0n
  ) {
    throw new Error("Trial Balance does not balance to zero");
  }
  return Object.freeze({
    organizationId: organizationId(input.organizationId),
    baseCurrency: currencyCode(input.baseCurrency),
    startsOn,
    endsOn,
    rows: Object.freeze(resultRows),
    ...totals,
  });
}

export function buildGeneralLedger(input: {
  journals: readonly LedgerJournalRecord[];
  organizationId: string;
  accountId: string;
  baseCurrency: string;
  startsOn: string;
  endsOn: string;
}): GeneralLedger {
  const startsOn = isoDate(input.startsOn, "General Ledger start date");
  const endsOn = isoDate(input.endsOn, "General Ledger end date");
  if (endsOn < startsOn) throw new Error("General Ledger end date cannot precede start date");
  const accountId = required(input.accountId, "General Ledger account ID");
  const journals = eligibleJournals({ ...input, throughDate: endsOn });
  let openingBalanceMinor = 0n;
  const periodLines: Array<{ journal: LedgerJournalRecord; line: JournalLine }> = [];
  for (const journal of journals) {
    for (const line of journal.lines) {
      if (line.accountId !== accountId) continue;
      if (journal.entryDate < startsOn) openingBalanceMinor += line.debitMinor - line.creditMinor;
      else periodLines.push({ journal, line });
    }
  }
  periodLines.sort(
    (left, right) =>
      left.journal.entryDate.localeCompare(right.journal.entryDate) ||
      left.journal.id.localeCompare(right.journal.id) ||
      left.line.id.localeCompare(right.line.id),
  );
  let runningBalanceMinor = openingBalanceMinor;
  const entries = periodLines.map<GeneralLedgerEntry>(({ journal, line }) => {
    runningBalanceMinor += line.debitMinor - line.creditMinor;
    return Object.freeze({
      journalId: journal.id,
      journalLineId: line.id,
      entryDate: journal.entryDate,
      description: line.description ?? journal.description,
      debitMinor: line.debitMinor,
      creditMinor: line.creditMinor,
      runningBalanceMinor,
      ...source(journal),
      dimensions: line.dimensions,
    });
  });
  return Object.freeze({
    organizationId: organizationId(input.organizationId),
    accountId,
    baseCurrency: currencyCode(input.baseCurrency),
    startsOn,
    endsOn,
    openingBalanceMinor,
    closingBalanceMinor: runningBalanceMinor,
    entries: Object.freeze(entries),
  });
}

export function validateOpeningBalances(input: {
  organizationId: string;
  baseCurrency: string;
  effectiveOn: string;
  approvedBy: string;
  approvedAt: string;
  expectedDebitMinor: bigint;
  expectedCreditMinor: bigint;
  lines: readonly OpeningBalanceLine[];
}): ValidatedOpeningBalances {
  if (!input.lines.length) throw new Error("Opening balances require at least one line");
  if (input.expectedDebitMinor < 0n || input.expectedCreditMinor < 0n) {
    throw new Error("Opening control totals cannot be negative");
  }
  if (input.expectedDebitMinor !== input.expectedCreditMinor) {
    throw new Error("Opening control totals must balance; hidden balancing plugs are forbidden");
  }
  const ids = new Set<string>();
  const lines = input.lines.map((line) => {
    const id = required(line.id, "Opening balance line ID");
    if (ids.has(id)) throw new Error("Opening balance line IDs must be unique");
    ids.add(id);
    const debitMinor = line.debitMinor ?? 0n;
    const creditMinor = line.creditMinor ?? 0n;
    if (debitMinor < 0n || creditMinor < 0n || debitMinor > 0n === creditMinor > 0n) {
      throw new Error("Opening line requires exactly one positive debit or credit amount");
    }
    if (line.controlAccount && (!line.partyId?.trim() || !line.documentReference?.trim())) {
      throw new Error("AR/AP opening lines require party and document detail");
    }
    return Object.freeze({
      id,
      accountId: required(line.accountId, "Opening account ID"),
      debitMinor,
      creditMinor,
      ...(line.controlAccount ? { controlAccount: line.controlAccount } : {}),
      ...(line.partyId?.trim() ? { partyId: line.partyId.trim() } : {}),
      ...(line.documentReference?.trim()
        ? { documentReference: line.documentReference.trim() }
        : {}),
      dimensions: Object.freeze({ ...(line.dimensions ?? {}) }),
    });
  });
  const totals = lines.reduce(
    (sum, line) => ({
      debitMinor: sum.debitMinor + line.debitMinor,
      creditMinor: sum.creditMinor + line.creditMinor,
    }),
    { debitMinor: 0n, creditMinor: 0n },
  );
  if (
    totals.debitMinor !== input.expectedDebitMinor ||
    totals.creditMinor !== input.expectedCreditMinor
  ) {
    throw new Error("Opening balance lines do not match approved control totals");
  }
  if (Number.isNaN(Date.parse(input.approvedAt)))
    throw new Error("Opening approval timestamp is invalid");
  return Object.freeze({
    organizationId: organizationId(input.organizationId),
    baseCurrency: currencyCode(input.baseCurrency),
    effectiveOn: isoDate(input.effectiveOn, "Opening balance effective date"),
    approvedBy: required(input.approvedBy, "Opening balance approver"),
    approvedAt: input.approvedAt,
    expectedDebitMinor: input.expectedDebitMinor,
    expectedCreditMinor: input.expectedCreditMinor,
    lines: Object.freeze(lines),
  });
}
