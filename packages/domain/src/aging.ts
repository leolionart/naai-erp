export const AGING_BUCKETS = [
  "current",
  "1_30",
  "31_60",
  "61_90",
  "over_90",
  "unclassified",
] as const;

export type AgingBucket = (typeof AGING_BUCKETS)[number];
export type AgingSide = "ar" | "ap";
export type AgingPaymentStatus = "unpaid" | "partially_paid" | "paid";
export type AgingBalanceKind = "receivable" | "customer_credit" | "payable" | "supplier_advance";
export type AgingMovementState = "posted" | "matched_reservation";

export type AgingMovement = Readonly<{
  id: string;
  journalId?: string;
  reconciliationId?: string;
  state: AgingMovementState;
  role: "origin" | "settlement" | "adjustment" | "reversal";
  effectiveOn: string;
  postedOn: string;
  debitMinor: bigint;
  creditMinor: bigint;
  baseDebitMinor?: bigint;
  baseCreditMinor?: bigint;
}>;

export type AgingSourceItem = Readonly<{
  organizationId: string;
  id: string;
  side: AgingSide;
  balanceKind: AgingBalanceKind;
  sourceType: "commercial_document" | "opening_balance" | "project_freelance_payable";
  sourceId: string;
  partyId: string;
  partyName: string;
  controlAccountCode: string;
  documentNumber: string;
  documentDate: string;
  dueDate?: string;
  currency: string;
  evidenceIds?: readonly string[];
  movements: readonly AgingMovement[];
}>;

export type AgingControlBalance = Readonly<{
  controlAccountCode: string;
  currency: string;
  balanceMinor: bigint;
  baseBalanceMinor: bigint;
}>;

export type AgingReportItem = Readonly<{
  id: string;
  side: AgingSide;
  balanceKind: AgingBalanceKind;
  sourceType: AgingSourceItem["sourceType"];
  sourceId: string;
  partyId: string;
  partyName: string;
  controlAccountCode: string;
  documentNumber: string;
  documentDate: string;
  dueDate?: string;
  currency: string;
  bucket: AgingBucket;
  daysOverdue?: number;
  paymentStatus: AgingPaymentStatus;
  originalMinor: bigint;
  settledMinor: bigint;
  outstandingMinor: bigint;
  signedOutstandingMinor: bigint;
  baseOutstandingMinor: bigint;
  signedBaseOutstandingMinor: bigint;
  journalIds: readonly string[];
  reconciliationIds: readonly string[];
  evidenceIds: readonly string[];
}>;

export type AgingControlTie = Readonly<{
  controlAccountCode: string;
  currency: string;
  status: "tied" | "out_of_balance";
  subledgerBalanceMinor: bigint;
  ledgerBalanceMinor: bigint;
  differenceMinor: bigint;
  subledgerBaseBalanceMinor: bigint;
  ledgerBaseBalanceMinor: bigint;
  baseDifferenceMinor: bigint;
}>;

export type AgingReport = Readonly<{
  organizationId: string;
  side: AgingSide;
  asOf: string;
  timezone: string;
  baseCurrency: string;
  items: readonly AgingReportItem[];
  bucketTotals: Readonly<Record<AgingBucket, bigint>>;
  creditOrAdvanceTotalMinor: bigint;
  outstandingTotalMinor: bigint;
  baseOutstandingTotalMinor: bigint;
  controlTies: readonly AgingControlTie[];
  tieStatus: "tied" | "out_of_balance";
}>;

export class UnsupportedAgingFxError extends Error {
  readonly code = "AGING_UNSUPPORTED_FX";

  constructor(
    readonly itemId: string,
    readonly currency: string,
    readonly baseCurrency: string,
  ) {
    super(`AGING_UNSUPPORTED_FX:${itemId}:${currency}->${baseCurrency}`);
    this.name = "UnsupportedAgingFxError";
  }
}

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

function currency(value: string, label: string): string {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) throw new Error(`${label} must be an ISO currency`);
  return normalized;
}

function dayDistance(later: string, earlier: string): number {
  return Math.round(
    (Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / 86_400_000,
  );
}

export function classifyAgingBucket(
  dueDate: string | undefined,
  asOfInput: string,
): Readonly<{ bucket: AgingBucket; daysOverdue?: number }> {
  const asOf = isoDate(asOfInput, "Aging as-of date");
  if (!dueDate) return Object.freeze({ bucket: "unclassified" });
  const due = isoDate(dueDate, "Aging due date");
  const daysOverdue = dayDistance(asOf, due);
  if (daysOverdue <= 0) return Object.freeze({ bucket: "current", daysOverdue: 0 });
  if (daysOverdue <= 30) return Object.freeze({ bucket: "1_30", daysOverdue });
  if (daysOverdue <= 60) return Object.freeze({ bucket: "31_60", daysOverdue });
  if (daysOverdue <= 90) return Object.freeze({ bucket: "61_90", daysOverdue });
  return Object.freeze({ bucket: "over_90", daysOverdue });
}

export function deriveAgingPaymentStatus(
  originalMinor: bigint,
  outstandingMinor: bigint,
): AgingPaymentStatus {
  if (originalMinor <= 0n) throw new Error("Aging original amount must be positive");
  if (outstandingMinor < 0n) throw new Error("Aging outstanding amount cannot be negative");
  if (outstandingMinor === 0n) return "paid";
  return outstandingMinor < originalMinor ? "partially_paid" : "unpaid";
}

function expectedKinds(side: AgingSide): readonly AgingBalanceKind[] {
  return side === "ar" ? ["receivable", "customer_credit"] : ["payable", "supplier_advance"];
}

function movementSigned(side: AgingSide, debit: bigint, credit: bigint): bigint {
  return side === "ar" ? debit - credit : credit - debit;
}

function isContra(kind: AgingBalanceKind): boolean {
  return kind === "customer_credit" || kind === "supplier_advance";
}

function unique(values: readonly (string | undefined)[]): readonly string[] {
  return Object.freeze(
    [...new Set(values.filter((value): value is string => Boolean(value)))].sort(),
  );
}

function materializeItem(
  item: AgingSourceItem,
  asOf: string,
  baseCurrency: string,
): AgingReportItem | undefined {
  required(item.organizationId, "Aging organization ID");
  required(item.id, "Aging item ID");
  required(item.sourceId, "Aging source ID");
  required(item.partyId, "Aging party ID");
  required(item.partyName, "Aging party name");
  required(item.controlAccountCode, "Aging control account");
  required(item.documentNumber, "Aging document number");
  isoDate(item.documentDate, "Aging document date");
  if (item.documentDate > asOf) return undefined;
  if (!expectedKinds(item.side).includes(item.balanceKind)) {
    throw new Error(`Aging balance kind ${item.balanceKind} is invalid for ${item.side}`);
  }
  const itemCurrency = currency(item.currency, "Aging item currency");
  const movements = item.movements.filter((movement) => {
    isoDate(movement.effectiveOn, "Aging movement effective date");
    isoDate(movement.postedOn, "Aging movement posting date");
    if (
      movement.debitMinor < 0n ||
      movement.creditMinor < 0n ||
      movement.debitMinor > 0n === movement.creditMinor > 0n
    ) {
      throw new Error("Aging movement requires exactly one positive debit or credit");
    }
    return movement.state === "posted" && movement.effectiveOn <= asOf && movement.postedOn <= asOf;
  });
  const originMovements = movements.filter((movement) => movement.role === "origin");
  if (originMovements.length === 0) return undefined;
  const originSigned = originMovements.reduce(
    (sum, movement) => sum + movementSigned(item.side, movement.debitMinor, movement.creditMinor),
    0n,
  );
  const netSigned = movements.reduce(
    (sum, movement) => sum + movementSigned(item.side, movement.debitMinor, movement.creditMinor),
    0n,
  );
  const contra = isContra(item.balanceKind);
  if ((contra && originSigned >= 0n) || (!contra && originSigned <= 0n)) {
    throw new Error("Aging origin polarity does not match balance kind");
  }
  if ((contra && netSigned > 0n) || (!contra && netSigned < 0n)) {
    throw new Error("Aging settlements exceed the source balance");
  }
  let baseNetSigned = 0n;
  for (const movement of movements) {
    let baseDebit = movement.baseDebitMinor;
    let baseCredit = movement.baseCreditMinor;
    if (baseDebit === undefined || baseCredit === undefined) {
      if (itemCurrency !== baseCurrency) {
        throw new UnsupportedAgingFxError(item.id, itemCurrency, baseCurrency);
      }
      baseDebit = movement.debitMinor;
      baseCredit = movement.creditMinor;
    }
    if (baseDebit < 0n || baseCredit < 0n || baseDebit > 0n === baseCredit > 0n) {
      throw new Error("Aging base movement requires exactly one positive debit or credit");
    }
    const signed = movementSigned(item.side, baseDebit, baseCredit);
    baseNetSigned += signed;
  }
  const originalMinor = originSigned < 0n ? -originSigned : originSigned;
  const outstandingMinor = netSigned < 0n ? -netSigned : netSigned;
  const baseOutstandingMinor = baseNetSigned < 0n ? -baseNetSigned : baseNetSigned;
  const settledMinor = originalMinor > outstandingMinor ? originalMinor - outstandingMinor : 0n;
  const aging = contra
    ? { bucket: "unclassified" as const }
    : classifyAgingBucket(item.dueDate, asOf);
  return Object.freeze({
    id: item.id,
    side: item.side,
    balanceKind: item.balanceKind,
    sourceType: item.sourceType,
    sourceId: item.sourceId,
    partyId: item.partyId,
    partyName: item.partyName,
    controlAccountCode: item.controlAccountCode,
    documentNumber: item.documentNumber,
    documentDate: item.documentDate,
    ...(item.dueDate ? { dueDate: item.dueDate } : {}),
    currency: itemCurrency,
    ...aging,
    paymentStatus: deriveAgingPaymentStatus(originalMinor, outstandingMinor),
    originalMinor,
    settledMinor,
    outstandingMinor,
    signedOutstandingMinor: netSigned,
    baseOutstandingMinor,
    signedBaseOutstandingMinor: baseNetSigned,
    journalIds: unique(movements.map((movement) => movement.journalId)),
    reconciliationIds: unique(movements.map((movement) => movement.reconciliationId)),
    evidenceIds: unique(item.evidenceIds ?? []),
  });
}

export function buildAgingReport(input: {
  organizationId: string;
  side: AgingSide;
  asOf: string;
  timezone: string;
  baseCurrency: string;
  items: readonly AgingSourceItem[];
  controlBalances: readonly AgingControlBalance[];
  includeSettled?: boolean;
}): AgingReport {
  const organizationId = required(input.organizationId, "Aging organization ID");
  const asOf = isoDate(input.asOf, "Aging as-of date");
  const timezone = required(input.timezone, "Aging timezone");
  const baseCurrency = currency(input.baseCurrency, "Aging base currency");
  const items = input.items
    .filter((item) => item.organizationId === organizationId && item.side === input.side)
    .map((item) => materializeItem(item, asOf, baseCurrency))
    .filter((item): item is AgingReportItem => Boolean(item))
    .filter((item) => input.includeSettled || item.paymentStatus !== "paid")
    .sort(
      (left, right) =>
        (left.dueDate ?? "9999-12-31").localeCompare(right.dueDate ?? "9999-12-31") ||
        left.partyId.localeCompare(right.partyId) ||
        left.id.localeCompare(right.id),
    );
  const bucketTotals = Object.fromEntries(AGING_BUCKETS.map((bucket) => [bucket, 0n])) as Record<
    AgingBucket,
    bigint
  >;
  for (const item of items)
    if (!isContra(item.balanceKind)) bucketTotals[item.bucket] += item.outstandingMinor;
  const keys = new Set([
    ...items.map((item) => `${item.controlAccountCode}:${item.currency}`),
    ...input.controlBalances.map(
      (balance) =>
        `${balance.controlAccountCode}:${currency(balance.currency, "Control currency")}`,
    ),
  ]);
  const controlTies = [...keys].sort().map<AgingControlTie>((key) => {
    const separator = key.lastIndexOf(":");
    const account = key.slice(0, separator);
    const itemCurrency = key.slice(separator + 1);
    const relevant = items.filter(
      (item) => item.controlAccountCode === account && item.currency === itemCurrency,
    );
    const subledgerBalanceMinor = relevant.reduce(
      (sum, item) => sum + item.signedOutstandingMinor,
      0n,
    );
    const subledgerBaseBalanceMinor = relevant.reduce(
      (sum, item) => sum + item.signedBaseOutstandingMinor,
      0n,
    );
    const ledger = input.controlBalances.find(
      (balance) =>
        balance.controlAccountCode === account &&
        currency(balance.currency, "Control currency") === itemCurrency,
    );
    const ledgerBalanceMinor = ledger?.balanceMinor ?? 0n;
    const ledgerBaseBalanceMinor = ledger?.baseBalanceMinor ?? 0n;
    const differenceMinor = subledgerBalanceMinor - ledgerBalanceMinor;
    const baseDifferenceMinor = subledgerBaseBalanceMinor - ledgerBaseBalanceMinor;
    return Object.freeze({
      controlAccountCode: account,
      currency: itemCurrency,
      status: differenceMinor === 0n && baseDifferenceMinor === 0n ? "tied" : "out_of_balance",
      subledgerBalanceMinor,
      ledgerBalanceMinor,
      differenceMinor,
      subledgerBaseBalanceMinor,
      ledgerBaseBalanceMinor,
      baseDifferenceMinor,
    });
  });
  return Object.freeze({
    organizationId,
    side: input.side,
    asOf,
    timezone,
    baseCurrency,
    items: Object.freeze(items),
    bucketTotals: Object.freeze(bucketTotals),
    creditOrAdvanceTotalMinor: items
      .filter((item) => isContra(item.balanceKind))
      .reduce((sum, item) => sum + item.outstandingMinor, 0n),
    outstandingTotalMinor: items
      .filter((item) => !isContra(item.balanceKind))
      .reduce((sum, item) => sum + item.outstandingMinor, 0n),
    baseOutstandingTotalMinor: items.reduce(
      (sum, item) => sum + item.signedBaseOutstandingMinor,
      0n,
    ),
    controlTies: Object.freeze(controlTies),
    tieStatus: controlTies.every((tie) => tie.status === "tied") ? "tied" : "out_of_balance",
  });
}
