import type { BankTransaction, BankTransactionState } from "./banking.js";

export const RECONCILIATION_TARGET_KINDS = [
  "sales_invoice",
  "purchase_invoice",
  "expense",
  "journal_line",
] as const;
export type ReconciliationTargetKind = (typeof RECONCILIATION_TARGET_KINDS)[number];
export type PaymentDirection = "receipt" | "payment";

export type MatchingPolicy = Readonly<{
  version: number;
  dateToleranceDays: number;
  autoMatchThresholdBps: number;
  weights: Readonly<{
    amount: number;
    date: number;
    reference: number;
    party: number;
    currency: number;
    outstanding: number;
  }>;
}>;

export type ReconciliationTransactionView = Readonly<{
  id: string;
  state: BankTransactionState;
  amountMinor: bigint;
  currency: string;
  bookingDate: string;
  reference?: string;
  counterpartyName?: string;
  partyId?: string;
}>;

export type ReconciliationCandidate = Readonly<{
  id: string;
  targetKind: ReconciliationTargetKind;
  targetId: string;
  direction: PaymentDirection;
  currency: string;
  outstandingMinor: bigint;
  documentDate: string;
  reference?: string;
  partyId?: string;
  counterpartyName?: string;
  allowFx?: boolean;
}>;

export type CandidateScore = Readonly<{
  candidateId: string;
  policyVersion: number;
  eligible: boolean;
  totalBps: number;
  factors: Readonly<{
    amountBps: number;
    dateBps: number;
    referenceBps: number;
    partyBps: number;
    currencyBps: number;
    outstandingBps: number;
  }>;
  reasons: readonly string[];
}>;

export type AutoMatchDecision = Readonly<{
  outcome: "unique" | "ambiguous" | "none";
  candidateId?: string;
  scores: readonly CandidateScore[];
}>;

export type ReconciliationAllocation = Readonly<{
  lineNumber: number;
  targetKind: ReconciliationTargetKind;
  targetId: string;
  controlAccountId: string;
  statementAmountMinor: bigint;
  targetAmountMinor: bigint;
  baseAmountMinor: bigint;
  targetOutstandingBeforeMinor: bigint;
  exchangeRateId?: string;
}>;

export type ReconciliationAdjustmentKind = "bank_fee" | "realized_fx" | "suspense";
export type ReconciliationAdjustment = Readonly<{
  lineNumber: number;
  kind: ReconciliationAdjustmentKind;
  accountId: string;
  side: "debit" | "credit";
  statementAmountMinor: bigint;
  baseAmountMinor: bigint;
  reason: string;
  exchangeRateId?: string;
}>;

export type ReconciliationAttemptState = "matched" | "reconciled" | "unreconciled";
export type ReconciliationAttempt = Readonly<{
  attemptNumber: number;
  state: ReconciliationAttemptState;
  allocations: readonly ReconciliationAllocation[];
  adjustments: readonly ReconciliationAdjustment[];
  policyVersion: number;
  candidateGeneration: number;
  bankBaseAmountMinor: bigint;
  manualOverrideReason?: string;
  journalId?: string;
  reversalJournalId?: string;
  reconciledBy?: string;
  reconciledReason?: string;
  unreconciledBy?: string;
  unreconciledReason?: string;
}>;

export type PaymentReconciliation = Readonly<{
  organizationId: string;
  id: string;
  bankTransactionId: string;
  direction: PaymentDirection;
  statementAmountMinor: bigint;
  statementCurrency: string;
  attempts: readonly ReconciliationAttempt[];
  version: number;
}>;

export type ReconciliationJournalLine = Readonly<{
  id: string;
  accountId: string;
  debitMinor?: bigint;
  creditMinor?: bigint;
  sourceKind: "bank" | "allocation" | "adjustment";
  sourceId: string;
}>;

const required = (value: string, label: string) => {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
};

function validDate(value: string, label: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`${label} must be an ISO date`);
  }
  return value;
}

function checkedPolicy(policy: MatchingPolicy): MatchingPolicy {
  if (!Number.isInteger(policy.version) || policy.version < 1) {
    throw new Error("Matching policy version must be positive");
  }
  if (!Number.isInteger(policy.dateToleranceDays) || policy.dateToleranceDays < 0) {
    throw new Error("Date tolerance must be a non-negative integer");
  }
  if (
    !Number.isInteger(policy.autoMatchThresholdBps) ||
    policy.autoMatchThresholdBps < 0 ||
    policy.autoMatchThresholdBps > 10_000
  ) {
    throw new Error("Auto-match threshold must be integer basis points");
  }
  const weights = Object.values(policy.weights);
  if (weights.some((value) => !Number.isInteger(value) || value < 0)) {
    throw new Error("Matching weights must be non-negative integer basis points");
  }
  if (weights.reduce((sum, value) => sum + value, 0) !== 10_000) {
    throw new Error("Matching weights must total 10000 basis points");
  }
  return policy;
}

const normalizedText = (value?: string) =>
  value?.normalize("NFKC").trim().replace(/\s+/g, " ").toUpperCase() ?? "";

function tokenScore(left: string | undefined, right: string | undefined, weight: number) {
  const a = new Set(
    normalizedText(left)
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean),
  );
  const b = new Set(
    normalizedText(right)
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean),
  );
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  const union = new Set([...a, ...b]).size;
  return Math.floor((weight * intersection) / union);
}

function dateDistanceDays(left: string, right: string) {
  return Math.floor(
    Math.abs(Date.parse(`${left}T00:00:00Z`) - Date.parse(`${right}T00:00:00Z`)) / 86_400_000,
  );
}

export function scoreReconciliationCandidate(
  transaction: ReconciliationTransactionView,
  candidate: ReconciliationCandidate,
  policyInput: MatchingPolicy,
): CandidateScore {
  const policy = checkedPolicy(policyInput);
  validDate(transaction.bookingDate, "Transaction booking date");
  validDate(candidate.documentDate, "Candidate document date");
  const expectedDirection: PaymentDirection = transaction.amountMinor > 0n ? "receipt" : "payment";
  const amount = transaction.amountMinor < 0n ? -transaction.amountMinor : transaction.amountMinor;
  const reasons: string[] = [];
  if (candidate.direction !== expectedDirection) reasons.push("direction_mismatch");
  if (candidate.outstandingMinor <= 0n) reasons.push("no_outstanding_balance");
  const currencyMatches = transaction.currency === candidate.currency;
  if (!currencyMatches && !candidate.allowFx) reasons.push("currency_mismatch");
  const eligible = reasons.length === 0;
  const amountMax = amount > candidate.outstandingMinor ? amount : candidate.outstandingMinor;
  const amountMin = amount < candidate.outstandingMinor ? amount : candidate.outstandingMinor;
  const amountBps =
    amountMax > 0n ? Number((BigInt(policy.weights.amount) * amountMin) / amountMax) : 0;
  const distance = dateDistanceDays(transaction.bookingDate, candidate.documentDate);
  const dateBps =
    distance > policy.dateToleranceDays
      ? 0
      : policy.dateToleranceDays === 0
        ? policy.weights.date
        : Math.floor(
            (policy.weights.date * (policy.dateToleranceDays + 1 - distance)) /
              (policy.dateToleranceDays + 1),
          );
  const referenceBps = tokenScore(
    transaction.reference,
    candidate.reference,
    policy.weights.reference,
  );
  const partyBps =
    (transaction.partyId && candidate.partyId && transaction.partyId === candidate.partyId) ||
    (normalizedText(transaction.counterpartyName) &&
      normalizedText(transaction.counterpartyName) === normalizedText(candidate.counterpartyName))
      ? policy.weights.party
      : 0;
  const currencyBps = currencyMatches ? policy.weights.currency : 0;
  const outstandingBps = candidate.outstandingMinor > 0n ? policy.weights.outstanding : 0;
  const totalBps = eligible
    ? amountBps + dateBps + referenceBps + partyBps + currencyBps + outstandingBps
    : 0;
  return Object.freeze({
    candidateId: candidate.id,
    policyVersion: policy.version,
    eligible,
    totalBps,
    factors: Object.freeze({
      amountBps,
      dateBps,
      referenceBps,
      partyBps,
      currencyBps,
      outstandingBps,
    }),
    reasons: Object.freeze(reasons),
  });
}

export function decideAutoMatch(
  transaction: ReconciliationTransactionView,
  candidates: readonly ReconciliationCandidate[],
  policy: MatchingPolicy,
): AutoMatchDecision {
  const scores = Object.freeze(
    candidates
      .map((candidate) => scoreReconciliationCandidate(transaction, candidate, policy))
      .sort((a, b) => b.totalBps - a.totalBps || a.candidateId.localeCompare(b.candidateId)),
  );
  const above = scores.filter(
    (score) => score.eligible && score.totalBps >= policy.autoMatchThresholdBps,
  );
  if (above.length === 1) {
    return Object.freeze({ outcome: "unique", candidateId: above[0]!.candidateId, scores });
  }
  return Object.freeze({ outcome: above.length > 1 ? "ambiguous" : "none", scores });
}

function validateAttemptCapacity(input: {
  statementAmountMinor: bigint;
  allocations: readonly ReconciliationAllocation[];
  adjustments: readonly ReconciliationAdjustment[];
  alreadyAllocatedByTarget?: Readonly<Record<string, bigint>>;
}) {
  if (input.statementAmountMinor <= 0n) throw new Error("Statement amount must be positive");
  const lineNumbers = new Set<number>();
  let consumed = 0n;
  for (const allocation of input.allocations) {
    if (!Number.isInteger(allocation.lineNumber) || allocation.lineNumber < 1) {
      throw new Error("Allocation line number must be positive");
    }
    if (lineNumbers.has(allocation.lineNumber)) throw new Error("Line numbers must be unique");
    lineNumbers.add(allocation.lineNumber);
    if (
      allocation.statementAmountMinor <= 0n ||
      allocation.targetAmountMinor <= 0n ||
      allocation.baseAmountMinor <= 0n ||
      allocation.targetOutstandingBeforeMinor <= 0n
    ) {
      throw new Error("Reconciliation allocation amounts must be positive");
    }
    const already = input.alreadyAllocatedByTarget?.[allocation.targetId] ?? 0n;
    if (already + allocation.targetAmountMinor > allocation.targetOutstandingBeforeMinor) {
      throw new Error("Reconciliation allocation exceeds target outstanding balance");
    }
    required(allocation.controlAccountId, "Allocation control account");
    consumed += allocation.statementAmountMinor;
  }
  for (const adjustment of input.adjustments) {
    if (!Number.isInteger(adjustment.lineNumber) || adjustment.lineNumber < 1) {
      throw new Error("Adjustment line number must be positive");
    }
    if (lineNumbers.has(adjustment.lineNumber)) throw new Error("Line numbers must be unique");
    lineNumbers.add(adjustment.lineNumber);
    required(adjustment.accountId, "Adjustment account");
    required(adjustment.reason, "Adjustment reason");
    if (adjustment.baseAmountMinor <= 0n)
      throw new Error("Adjustment base amount must be positive");
    if (adjustment.kind === "realized_fx") {
      if (adjustment.statementAmountMinor !== 0n || !adjustment.exchangeRateId) {
        throw new Error("Realized FX requires zero statement amount and an exchange rate");
      }
    } else {
      if (adjustment.statementAmountMinor <= 0n) {
        throw new Error("Fee and suspense adjustments consume a positive statement amount");
      }
      consumed += adjustment.statementAmountMinor;
    }
  }
  if (consumed > input.statementAmountMinor) {
    throw new Error("Reconciliation exceeds bank transaction amount");
  }
  if (consumed !== input.statementAmountMinor) {
    throw new Error("Matched reconciliation must explain the full bank transaction amount");
  }
}

export function createMatchedReconciliation(input: {
  organizationId: string;
  id: string;
  transaction: ReconciliationTransactionView;
  allocations: readonly ReconciliationAllocation[];
  adjustments?: readonly ReconciliationAdjustment[];
  policyVersion: number;
  candidateGeneration: number;
  bankBaseAmountMinor: bigint;
  manualOverrideReason?: string;
  manualOverrideRequired?: boolean;
  alreadyAllocatedByTarget?: Readonly<Record<string, bigint>>;
}): PaymentReconciliation {
  if (
    !(["suggested", "needs_review"] as BankTransactionState[]).includes(input.transaction.state)
  ) {
    throw new Error("Only suggested or review transactions can be matched");
  }
  if (!Number.isInteger(input.policyVersion) || input.policyVersion < 1) {
    throw new Error("Matching policy version must be positive");
  }
  if (!Number.isInteger(input.candidateGeneration) || input.candidateGeneration < 1) {
    throw new Error("Candidate generation must be positive");
  }
  if (input.bankBaseAmountMinor <= 0n) throw new Error("Bank base amount must be positive");
  if (input.manualOverrideRequired && !input.manualOverrideReason?.trim()) {
    throw new Error("Manual override reason is required for an ambiguous or below-threshold match");
  }
  const statementAmountMinor =
    input.transaction.amountMinor < 0n
      ? -input.transaction.amountMinor
      : input.transaction.amountMinor;
  const adjustments = input.adjustments ?? [];
  validateAttemptCapacity({
    statementAmountMinor,
    allocations: input.allocations,
    adjustments,
    ...(input.alreadyAllocatedByTarget
      ? { alreadyAllocatedByTarget: input.alreadyAllocatedByTarget }
      : {}),
  });
  const attempt: ReconciliationAttempt = Object.freeze({
    attemptNumber: 1,
    state: "matched",
    allocations: Object.freeze([...input.allocations]),
    adjustments: Object.freeze([...adjustments]),
    policyVersion: input.policyVersion,
    candidateGeneration: input.candidateGeneration,
    bankBaseAmountMinor: input.bankBaseAmountMinor,
    ...(input.manualOverrideReason
      ? { manualOverrideReason: required(input.manualOverrideReason, "Manual override reason") }
      : {}),
  });
  return Object.freeze({
    organizationId: required(input.organizationId, "Organization ID"),
    id: required(input.id, "Reconciliation ID"),
    bankTransactionId: required(input.transaction.id, "Bank transaction ID"),
    direction: input.transaction.amountMinor > 0n ? "receipt" : "payment",
    statementAmountMinor,
    statementCurrency: required(input.transaction.currency, "Statement currency"),
    attempts: Object.freeze([attempt]),
    version: 1,
  });
}

export function appendReconciliationAttempt(
  reconciliation: PaymentReconciliation,
  input: Omit<ReconciliationAttempt, "attemptNumber" | "state">,
): PaymentReconciliation {
  const current = reconciliation.attempts.at(-1);
  if (!current || current.state !== "unreconciled") {
    throw new Error("A new match attempt requires an authorized unreconciled predecessor");
  }
  validateAttemptCapacity({
    statementAmountMinor: reconciliation.statementAmountMinor,
    allocations: input.allocations,
    adjustments: input.adjustments,
  });
  const next = Object.freeze({
    ...input,
    attemptNumber: current.attemptNumber + 1,
    state: "matched" as const,
  });
  return Object.freeze({
    ...reconciliation,
    attempts: Object.freeze([...reconciliation.attempts, next]),
    version: reconciliation.version + 1,
  });
}

export function reconcilePayment(
  reconciliation: PaymentReconciliation,
  input: { journalId: string; actorId: string; reason: string },
): PaymentReconciliation {
  const current = reconciliation.attempts.at(-1);
  if (!current || current.state !== "matched")
    throw new Error("Only a matched attempt can reconcile");
  const updated = Object.freeze({
    ...current,
    state: "reconciled" as const,
    journalId: required(input.journalId, "Payment journal ID"),
    reconciledBy: required(input.actorId, "Reconciliation actor"),
    reconciledReason: required(input.reason, "Reconciliation reason"),
  });
  return Object.freeze({
    ...reconciliation,
    attempts: Object.freeze([...reconciliation.attempts.slice(0, -1), updated]),
    version: reconciliation.version + 1,
  });
}

export function authorizeUnreconcile(
  reconciliation: PaymentReconciliation,
  input: {
    actorId: string;
    actorRoles: readonly string[];
    reason: string;
    reversalJournalId: string;
  },
): PaymentReconciliation {
  const current = reconciliation.attempts.at(-1);
  if (!current || current.state !== "reconciled") {
    throw new Error("Only a reconciled attempt can be unreconciled");
  }
  if (!input.actorRoles.some((role) => ["owner", "finance_admin", "accountant"].includes(role))) {
    throw new Error("Authorized finance role is required to unreconcile");
  }
  const updated = Object.freeze({
    ...current,
    state: "unreconciled" as const,
    reversalJournalId: required(input.reversalJournalId, "Reversal journal ID"),
    unreconciledBy: required(input.actorId, "Unreconciliation actor"),
    unreconciledReason: required(input.reason, "Unreconciliation reason"),
  });
  return Object.freeze({
    ...reconciliation,
    attempts: Object.freeze([...reconciliation.attempts.slice(0, -1), updated]),
    version: reconciliation.version + 1,
  });
}

export function bankStateAfterAuthorizedUnreconcile(transaction: BankTransaction): BankTransaction {
  if (transaction.state !== "reconciled") throw new Error("Bank transaction is not reconciled");
  return Object.freeze({ ...transaction, state: "needs_review" });
}

export function buildReconciliationJournalLines(
  reconciliation: PaymentReconciliation,
  bankLedgerAccountId: string,
): readonly ReconciliationJournalLine[] {
  const attempt = reconciliation.attempts.at(-1);
  if (!attempt) throw new Error("Reconciliation attempt is required");
  const bankAccount = required(bankLedgerAccountId, "Bank ledger account");
  const lines: ReconciliationJournalLine[] = [
    Object.freeze({
      id: "bank",
      accountId: bankAccount,
      ...(reconciliation.direction === "receipt"
        ? { debitMinor: attempt.bankBaseAmountMinor }
        : { creditMinor: attempt.bankBaseAmountMinor }),
      sourceKind: "bank" as const,
      sourceId: reconciliation.bankTransactionId,
    }),
    ...attempt.allocations.map((allocation) =>
      Object.freeze({
        id: `allocation-${allocation.lineNumber}`,
        accountId: allocation.controlAccountId,
        ...(reconciliation.direction === "receipt"
          ? { creditMinor: allocation.baseAmountMinor }
          : { debitMinor: allocation.baseAmountMinor }),
        sourceKind: "allocation" as const,
        sourceId: allocation.targetId,
      }),
    ),
    ...attempt.adjustments.map((adjustment) =>
      Object.freeze({
        id: `adjustment-${adjustment.lineNumber}`,
        accountId: adjustment.accountId,
        ...(adjustment.side === "debit"
          ? { debitMinor: adjustment.baseAmountMinor }
          : { creditMinor: adjustment.baseAmountMinor }),
        sourceKind: "adjustment" as const,
        sourceId: adjustment.kind,
      }),
    ),
  ];
  const debit = lines.reduce((sum, line) => sum + (line.debitMinor ?? 0n), 0n);
  const credit = lines.reduce((sum, line) => sum + (line.creditMinor ?? 0n), 0n);
  if (debit !== credit) throw new Error("Reconciliation journal must balance exactly");
  return Object.freeze(lines);
}
