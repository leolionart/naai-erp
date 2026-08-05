import { currencyCode, type CurrencyCode } from "./organization-setup.js";
import { organizationId, type OrganizationId } from "./organization.js";

export const JOURNAL_STATES = ["draft", "approved", "posted", "reversed"] as const;
export type JournalState = (typeof JOURNAL_STATES)[number];

export type JournalDimensions = Readonly<{
  clientId?: string;
  projectId?: string;
  contractId?: string;
  costCenterCode?: string;
  serviceLineCode?: string;
  categoryCode?: string;
  taxCode?: string;
}>;

export type JournalLine = Readonly<{
  id: string;
  accountId: string;
  description?: string;
  debitMinor: bigint;
  creditMinor: bigint;
  dimensions: JournalDimensions;
}>;

export type JournalEntry = Readonly<{
  organizationId: OrganizationId;
  id: string;
  entryDate: string;
  baseCurrency: CurrencyCode;
  description: string;
  lines: readonly JournalLine[];
  state: JournalState;
  version: number;
  approvedAt?: string;
  postedAt?: string;
  reversedAt?: string;
  reversalOfJournalId?: string;
  reversedByJournalId?: string;
}>;

export type JournalTotals = Readonly<{
  debitMinor: bigint;
  creditMinor: bigint;
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

function isoTimestamp(value: string, label: string): string {
  if (Number.isNaN(Date.parse(value))) throw new Error(`${label} must be an ISO timestamp`);
  return value;
}

function journalLine(input: {
  id: string;
  accountId: string;
  description?: string;
  debitMinor?: bigint;
  creditMinor?: bigint;
  dimensions?: JournalDimensions;
}): JournalLine {
  const debitMinor = input.debitMinor ?? 0n;
  const creditMinor = input.creditMinor ?? 0n;
  if (debitMinor < 0n || creditMinor < 0n) {
    throw new Error("Journal line amounts cannot be negative");
  }
  if (debitMinor > 0n === creditMinor > 0n) {
    throw new Error("Journal line requires exactly one positive debit or credit amount");
  }
  return Object.freeze({
    id: required(input.id, "Journal line ID"),
    accountId: required(input.accountId, "Journal account ID"),
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
    debitMinor,
    creditMinor,
    dimensions: Object.freeze({ ...(input.dimensions ?? {}) }),
  });
}

function immutableJournal(entry: JournalEntry): JournalEntry {
  return Object.freeze({ ...entry, lines: Object.freeze([...entry.lines]) });
}

export function createDraftJournal(input: {
  organizationId: string;
  id: string;
  entryDate: string;
  baseCurrency: string;
  description: string;
  lines: readonly {
    id: string;
    accountId: string;
    description?: string;
    debitMinor?: bigint;
    creditMinor?: bigint;
    dimensions?: JournalDimensions;
  }[];
}): JournalEntry {
  if (input.lines.length < 2) throw new Error("Journal requires at least two lines");
  const lines = input.lines.map(journalLine);
  if (new Set(lines.map((line) => line.id)).size !== lines.length) {
    throw new Error("Journal line IDs must be unique within the journal");
  }
  return immutableJournal({
    organizationId: organizationId(input.organizationId),
    id: required(input.id, "Journal ID"),
    entryDate: isoDate(input.entryDate, "Journal entry date"),
    baseCurrency: currencyCode(input.baseCurrency),
    description: required(input.description, "Journal description"),
    lines,
    state: "draft",
    version: 1,
  });
}

export function journalTotals(journal: Pick<JournalEntry, "lines">): JournalTotals {
  return journal.lines.reduce<JournalTotals>(
    (totals, line) => ({
      debitMinor: totals.debitMinor + line.debitMinor,
      creditMinor: totals.creditMinor + line.creditMinor,
    }),
    { debitMinor: 0n, creditMinor: 0n },
  );
}

export function assertJournalBalanced(journal: Pick<JournalEntry, "lines">): void {
  const totals = journalTotals(journal);
  if (totals.debitMinor !== totals.creditMinor) {
    throw new Error(
      `Journal is not balanced: debit ${totals.debitMinor} != credit ${totals.creditMinor}`,
    );
  }
}

export function approveJournal(journal: JournalEntry, approvedAt: string): JournalEntry {
  if (journal.state !== "draft") {
    throw new Error(`Only draft journals can be approved; current state is ${journal.state}`);
  }
  return immutableJournal({
    ...journal,
    state: "approved",
    approvedAt: isoTimestamp(approvedAt, "Approval timestamp"),
    version: journal.version + 1,
  });
}

export function postJournal(journal: JournalEntry, postedAt: string): JournalEntry {
  if (journal.state !== "approved") {
    throw new Error(`Only approved journals can be posted; current state is ${journal.state}`);
  }
  assertJournalBalanced(journal);
  return immutableJournal({
    ...journal,
    state: "posted",
    postedAt: isoTimestamp(postedAt, "Posting timestamp"),
    version: journal.version + 1,
  });
}

export function reverseJournal(
  original: JournalEntry,
  input: {
    reversalJournalId: string;
    reversalDate: string;
    reversedAt: string;
    description?: string;
  },
): Readonly<{ original: JournalEntry; reversal: JournalEntry }> {
  if (original.state !== "posted") {
    throw new Error(`Only posted journals can be reversed; current state is ${original.state}`);
  }
  if (original.reversalOfJournalId) throw new Error("A reversal journal cannot itself be reversed");
  const reversalId = required(input.reversalJournalId, "Reversal journal ID");
  if (reversalId === original.id) throw new Error("Reversal journal must have a distinct ID");
  const reversedAt = isoTimestamp(input.reversedAt, "Reversal timestamp");
  const reversalDraft = createDraftJournal({
    organizationId: original.organizationId,
    id: reversalId,
    entryDate: input.reversalDate,
    baseCurrency: original.baseCurrency,
    description: input.description?.trim() || `Reversal of ${original.id}`,
    lines: original.lines.map((line, index) => ({
      id: `${reversalId}-line-${index + 1}`,
      accountId: line.accountId,
      ...(line.description ? { description: line.description } : {}),
      debitMinor: line.creditMinor,
      creditMinor: line.debitMinor,
      dimensions: line.dimensions,
    })),
  });
  const reversal = immutableJournal({
    ...postJournal(approveJournal(reversalDraft, reversedAt), reversedAt),
    reversalOfJournalId: original.id,
  });
  const reversedOriginal = immutableJournal({
    ...original,
    state: "reversed",
    reversedAt,
    reversedByJournalId: reversal.id,
    version: original.version + 1,
  });
  return Object.freeze({ original: reversedOriginal, reversal });
}
