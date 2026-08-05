import type { BankTransactionState } from "./banking.js";

export type TransferLegRole = "source" | "destination";
export type InternalTransferState =
  "pending_counterpart" | "matched" | "reconciled" | "unmatched" | "needs_review";

export type OwnedTransferTransaction = Readonly<{
  id: string;
  financialAccountId: string;
  ledgerAccountId: string;
  amountMinor: bigint;
  currency: string;
  bookingDate: string;
  reference?: string;
  state: BankTransactionState;
}>;

export type TransferLeg = Readonly<{
  role: TransferLegRole;
  transaction: OwnedTransferTransaction;
  statementAmountMinor: bigint;
  principalAmountMinor: bigint;
  baseAmountMinor: bigint;
  journalId?: string;
}>;

export type InternalTransferFee = Readonly<{
  mode: "embedded" | "separate_transaction";
  amountMinor: bigint;
  baseAmountMinor: bigint;
  expenseAccountId: string;
  reason: string;
  transactionId?: string;
  transaction?: OwnedTransferTransaction;
  journalId?: string;
}>;

export type InternalTransferAttempt = Readonly<{
  attemptNumber: number;
  state: InternalTransferState;
  source?: TransferLeg;
  destination?: TransferLeg;
  fee?: InternalTransferFee;
  postingMode: "direct" | "transit";
  transitAccountId: string;
  journalIds: readonly string[];
  reversalJournalIds: readonly string[];
}>;

export type TransferAuditEvent = Readonly<{
  action: "create" | "match" | "post" | "unmatch";
  actorId: string;
  reason: string;
  idempotencyKey: string;
  commandFingerprint: string;
  attemptNumber: number;
}>;

export type InternalTransfer = Readonly<{
  organizationId: string;
  id: string;
  principalAmountMinor: bigint;
  basePrincipalAmountMinor: bigint;
  currency: string;
  attempts: readonly InternalTransferAttempt[];
  events: readonly TransferAuditEvent[];
  version: number;
}>;

export type TransferCandidatePolicy = Readonly<{
  version: number;
  dateToleranceDays: number;
  autoMatchThresholdBps: number;
  weights: Readonly<{
    amount: number;
    date: number;
    reference: number;
    currency: number;
    ownAccount: number;
  }>;
}>;

export type TransferCandidateScore = Readonly<{
  candidateTransactionId: string;
  eligible: boolean;
  totalBps: number;
  factors: Readonly<{
    amountBps: number;
    dateBps: number;
    referenceBps: number;
    currencyBps: number;
    ownAccountBps: number;
  }>;
  reasons: readonly string[];
}>;

export type TransferCandidateDecision = Readonly<{
  outcome: "unique" | "ambiguous" | "none";
  candidateTransactionId?: string;
  scores: readonly TransferCandidateScore[];
}>;

export type TransferJournalLine = Readonly<{
  id: string;
  accountId: string;
  accountRole: "bank" | "transit" | "fee_expense";
  debitMinor?: bigint;
  creditMinor?: bigint;
}>;

export type TransferJournalDraft = Readonly<{
  id: string;
  purpose: "direct_transfer" | "source_to_transit" | "transit_to_destination" | "separate_fee";
  lines: readonly TransferJournalLine[];
}>;

const required = (value: string, label: string) => {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
};

function isoDate(value: string, label: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`${label} must be an ISO date`);
  }
  return value;
}

function absolute(value: bigint) {
  return value < 0n ? -value : value;
}

function normalizeText(value?: string) {
  return value?.normalize("NFKC").trim().replace(/\s+/g, " ").toUpperCase() ?? "";
}

function validateTransaction(transaction: OwnedTransferTransaction, role: TransferLegRole) {
  required(transaction.id, "Transfer transaction ID");
  required(transaction.financialAccountId, "Financial account ID");
  required(transaction.ledgerAccountId, "Ledger account ID");
  required(transaction.currency, "Transfer currency");
  isoDate(transaction.bookingDate, "Transfer booking date");
  if (transaction.amountMinor === 0n) throw new Error("Transfer transaction amount cannot be zero");
  if (role === "source" && transaction.amountMinor >= 0n) {
    throw new Error("Source transfer transaction must be an outflow");
  }
  if (role === "destination" && transaction.amountMinor <= 0n) {
    throw new Error("Destination transfer transaction must be an inflow");
  }
  if (["reconciled", "ignored"].includes(transaction.state)) {
    throw new Error("Locked bank transaction cannot enter an internal transfer");
  }
}

function createLeg(input: {
  role: TransferLegRole;
  transaction: OwnedTransferTransaction;
  principalAmountMinor: bigint;
  baseAmountMinor: bigint;
  embeddedFeeMinor: bigint;
}): TransferLeg {
  validateTransaction(input.transaction, input.role);
  if (input.principalAmountMinor <= 0n || input.baseAmountMinor <= 0n) {
    throw new Error("Transfer principal and base amounts must be positive");
  }
  const statementAmountMinor = absolute(input.transaction.amountMinor);
  const expectedStatement =
    input.role === "source"
      ? input.principalAmountMinor + input.embeddedFeeMinor
      : input.principalAmountMinor;
  if (statementAmountMinor !== expectedStatement) {
    throw new Error("Transfer statement amount does not equal explicit principal and fee");
  }
  return Object.freeze({
    role: input.role,
    transaction: Object.freeze({ ...input.transaction }),
    statementAmountMinor,
    principalAmountMinor: input.principalAmountMinor,
    baseAmountMinor: input.baseAmountMinor,
  });
}

function validateFee(fee: InternalTransferFee | undefined) {
  if (!fee) return undefined;
  if (fee.amountMinor <= 0n || fee.baseAmountMinor <= 0n) {
    throw new Error("Transfer fee amounts must be positive");
  }
  required(fee.expenseAccountId, "Transfer fee expense account");
  required(fee.reason, "Transfer fee reason");
  if (fee.mode === "separate_transaction" && (!fee.transactionId?.trim() || !fee.transaction)) {
    throw new Error("Separate bank fee requires its own resolved transaction leg");
  }
  if (fee.mode === "embedded" && fee.transactionId) {
    throw new Error("Embedded bank fee cannot reference a separate transaction");
  }
  return Object.freeze({ ...fee });
}

function commandReplay(
  transfer: InternalTransfer,
  action: TransferAuditEvent["action"],
  idempotencyKey: string,
  fingerprint: string,
) {
  const event = transfer.events.find((item) => item.idempotencyKey === idempotencyKey);
  if (!event) return false;
  if (event.action !== action || event.commandFingerprint !== fingerprint) {
    throw new Error("Internal transfer idempotency conflict");
  }
  return true;
}

function event(input: {
  action: TransferAuditEvent["action"];
  actorId: string;
  reason: string;
  idempotencyKey: string;
  commandFingerprint: string;
  attemptNumber: number;
}): TransferAuditEvent {
  return Object.freeze({
    action: input.action,
    actorId: required(input.actorId, "Transfer actor"),
    reason: required(input.reason, "Transfer reason"),
    idempotencyKey: required(input.idempotencyKey, "Transfer idempotency key"),
    commandFingerprint: required(input.commandFingerprint, "Transfer command fingerprint"),
    attemptNumber: input.attemptNumber,
  });
}

function validatePair(source: TransferLeg, destination: TransferLeg, currency: string) {
  if (source.transaction.id === destination.transaction.id) {
    throw new Error("Internal transfer legs require distinct bank transactions");
  }
  if (source.transaction.financialAccountId === destination.transaction.financialAccountId) {
    throw new Error("Internal transfer legs require distinct owned accounts");
  }
  if (source.transaction.currency !== currency || destination.transaction.currency !== currency) {
    throw new Error("Cross-currency internal transfer requires explicit reviewed FX handling");
  }
  if (
    source.principalAmountMinor !== destination.principalAmountMinor ||
    source.baseAmountMinor !== destination.baseAmountMinor
  ) {
    throw new Error("Internal transfer principal must match exactly between both legs");
  }
}

export function createInternalTransfer(input: {
  organizationId: string;
  id: string;
  principalAmountMinor: bigint;
  basePrincipalAmountMinor: bigint;
  currency: string;
  source?: OwnedTransferTransaction;
  destination?: OwnedTransferTransaction;
  fee?: InternalTransferFee;
  transitAccountId: string;
  postingMode?: "direct" | "transit";
  actorId: string;
  reason: string;
  idempotencyKey: string;
  commandFingerprint: string;
}): InternalTransfer {
  if (!input.source && !input.destination)
    throw new Error("Internal transfer requires at least one leg");
  if (input.principalAmountMinor <= 0n || input.basePrincipalAmountMinor <= 0n) {
    throw new Error("Transfer principal amounts must be positive");
  }
  const fee = validateFee(input.fee);
  if (fee && !input.source) {
    throw new Error("Transfer fee requires the source account leg");
  }
  const embeddedFeeMinor = fee?.mode === "embedded" ? fee.amountMinor : 0n;
  const source = input.source
    ? createLeg({
        role: "source",
        transaction: input.source,
        principalAmountMinor: input.principalAmountMinor,
        baseAmountMinor: input.basePrincipalAmountMinor,
        embeddedFeeMinor,
      })
    : undefined;
  const destination = input.destination
    ? createLeg({
        role: "destination",
        transaction: input.destination,
        principalAmountMinor: input.principalAmountMinor,
        baseAmountMinor: input.basePrincipalAmountMinor,
        embeddedFeeMinor: 0n,
      })
    : undefined;
  const currency = required(input.currency, "Transfer currency");
  if (fee?.mode === "separate_transaction") {
    validateTransaction(fee.transaction!, "source");
    if (
      fee.transaction!.id !== fee.transactionId ||
      absolute(fee.transaction!.amountMinor) !== fee.amountMinor ||
      fee.transaction!.currency !== currency ||
      fee.transaction!.financialAccountId !== source?.transaction.financialAccountId
    ) {
      throw new Error("Separate bank fee transaction does not match the explicit fee leg");
    }
  }
  if (source && destination) validatePair(source, destination, currency);
  if ((source?.transaction.currency ?? destination?.transaction.currency) !== currency) {
    throw new Error("Cross-currency internal transfer requires explicit reviewed FX handling");
  }
  const postingMode = source && destination ? (input.postingMode ?? "direct") : "transit";
  const attempt: InternalTransferAttempt = Object.freeze({
    attemptNumber: 1,
    state: source && destination ? "matched" : "pending_counterpart",
    ...(source ? { source } : {}),
    ...(destination ? { destination } : {}),
    ...(fee ? { fee } : {}),
    postingMode,
    transitAccountId: required(input.transitAccountId, "Transit account"),
    journalIds: Object.freeze([]),
    reversalJournalIds: Object.freeze([]),
  });
  return Object.freeze({
    organizationId: required(input.organizationId, "Organization ID"),
    id: required(input.id, "Internal transfer ID"),
    principalAmountMinor: input.principalAmountMinor,
    basePrincipalAmountMinor: input.basePrincipalAmountMinor,
    currency,
    attempts: Object.freeze([attempt]),
    events: Object.freeze([
      event({
        action: "create",
        actorId: input.actorId,
        reason: input.reason,
        idempotencyKey: input.idempotencyKey,
        commandFingerprint: input.commandFingerprint,
        attemptNumber: 1,
      }),
    ]),
    version: 1,
  });
}

export function matchInternalTransfer(
  transfer: InternalTransfer,
  input: {
    counterpart: OwnedTransferTransaction;
    actorId: string;
    reason: string;
    idempotencyKey: string;
    commandFingerprint: string;
  },
): InternalTransfer {
  if (commandReplay(transfer, "match", input.idempotencyKey, input.commandFingerprint)) {
    return transfer;
  }
  const current = transfer.attempts.at(-1);
  if (!current || !["pending_counterpart", "unmatched"].includes(current.state)) {
    throw new Error("Internal transfer is not waiting for a counterpart");
  }
  const fee = current.fee;
  const embeddedFeeMinor = fee?.mode === "embedded" ? fee.amountMinor : 0n;
  const source =
    current.source ??
    createLeg({
      role: "source",
      transaction: input.counterpart,
      principalAmountMinor: transfer.principalAmountMinor,
      baseAmountMinor: transfer.basePrincipalAmountMinor,
      embeddedFeeMinor,
    });
  const destination =
    current.destination ??
    createLeg({
      role: "destination",
      transaction: input.counterpart,
      principalAmountMinor: transfer.principalAmountMinor,
      baseAmountMinor: transfer.basePrincipalAmountMinor,
      embeddedFeeMinor: 0n,
    });
  validatePair(source, destination, transfer.currency);
  const attemptNumber = current.attemptNumber + 1;
  const next: InternalTransferAttempt = Object.freeze({
    attemptNumber,
    state: "matched",
    source,
    destination,
    ...(fee ? { fee } : {}),
    postingMode: current.journalIds.length ? "transit" : current.postingMode,
    transitAccountId: current.transitAccountId,
    journalIds: current.journalIds,
    reversalJournalIds: Object.freeze([]),
  });
  return Object.freeze({
    ...transfer,
    attempts: Object.freeze([...transfer.attempts, next]),
    events: Object.freeze([
      ...transfer.events,
      event({ ...input, action: "match", attemptNumber }),
    ]),
    version: transfer.version + 1,
  });
}

export function recordInternalTransferPosting(
  transfer: InternalTransfer,
  input: {
    journalIds: readonly string[];
    actorId: string;
    reason: string;
    idempotencyKey: string;
    commandFingerprint: string;
  },
): InternalTransfer {
  if (commandReplay(transfer, "post", input.idempotencyKey, input.commandFingerprint))
    return transfer;
  const current = transfer.attempts.at(-1);
  if (!current || !["pending_counterpart", "matched"].includes(current.state)) {
    throw new Error("Internal transfer cannot post from its current state");
  }
  if (!input.journalIds.length || input.journalIds.some((id) => !id.trim())) {
    throw new Error("Internal transfer posting requires journal IDs");
  }
  const next = Object.freeze({
    ...current,
    state: current.source && current.destination ? ("reconciled" as const) : current.state,
    journalIds: Object.freeze([...new Set([...current.journalIds, ...input.journalIds])]),
  });
  return Object.freeze({
    ...transfer,
    attempts: Object.freeze([...transfer.attempts.slice(0, -1), next]),
    events: Object.freeze([
      ...transfer.events,
      event({ ...input, action: "post", attemptNumber: current.attemptNumber }),
    ]),
    version: transfer.version + 1,
  });
}

export function authorizeUnmatchInternalTransfer(
  transfer: InternalTransfer,
  input: {
    actorId: string;
    actorRoles: readonly string[];
    reason: string;
    idempotencyKey: string;
    commandFingerprint: string;
    reversalJournalIds?: readonly string[];
  },
): InternalTransfer {
  if (commandReplay(transfer, "unmatch", input.idempotencyKey, input.commandFingerprint)) {
    return transfer;
  }
  const current = transfer.attempts.at(-1);
  if (!current || !["matched", "reconciled"].includes(current.state)) {
    throw new Error("Only matched or reconciled transfers can be unmatched");
  }
  if (!input.actorRoles.some((role) => ["owner", "finance_admin", "accountant"].includes(role))) {
    throw new Error("Authorized finance role is required to unmatch an internal transfer");
  }
  const reversals = input.reversalJournalIds ?? [];
  if (current.state === "reconciled" && reversals.length !== current.journalIds.length) {
    throw new Error("Reconciled internal transfer requires a reversal for every posted journal");
  }
  const attemptNumber = current.attemptNumber + 1;
  const next: InternalTransferAttempt = Object.freeze({
    ...current,
    attemptNumber,
    state: "unmatched",
    journalIds: current.journalIds,
    reversalJournalIds: Object.freeze([...reversals]),
  });
  return Object.freeze({
    ...transfer,
    attempts: Object.freeze([...transfer.attempts, next]),
    events: Object.freeze([
      ...transfer.events,
      event({ ...input, action: "unmatch", attemptNumber }),
    ]),
    version: transfer.version + 1,
  });
}

function checkedCandidatePolicy(policy: TransferCandidatePolicy) {
  if (!Number.isInteger(policy.version) || policy.version < 1)
    throw new Error("Policy version invalid");
  if (!Number.isInteger(policy.dateToleranceDays) || policy.dateToleranceDays < 0) {
    throw new Error("Date tolerance invalid");
  }
  const weights = Object.values(policy.weights);
  if (weights.some((value) => !Number.isInteger(value) || value < 0)) {
    throw new Error("Transfer candidate weights must be integer basis points");
  }
  if (weights.reduce((sum, value) => sum + value, 0) !== 10_000) {
    throw new Error("Transfer candidate weights must total 10000 basis points");
  }
  if (
    !Number.isInteger(policy.autoMatchThresholdBps) ||
    policy.autoMatchThresholdBps < 0 ||
    policy.autoMatchThresholdBps > 10_000
  ) {
    throw new Error("Transfer threshold must be integer basis points");
  }
  return policy;
}

export function scoreTransferCandidate(
  transaction: OwnedTransferTransaction,
  candidate: OwnedTransferTransaction,
  principalAmountMinor: bigint,
  policyInput: TransferCandidatePolicy,
): TransferCandidateScore {
  const policy = checkedCandidatePolicy(policyInput);
  isoDate(transaction.bookingDate, "Transfer booking date");
  isoDate(candidate.bookingDate, "Candidate booking date");
  const reasons: string[] = [];
  if (transaction.id === candidate.id) reasons.push("same_transaction");
  if (transaction.financialAccountId === candidate.financialAccountId) reasons.push("same_account");
  if (transaction.amountMinor > 0n === candidate.amountMinor > 0n) reasons.push("same_direction");
  if (transaction.currency !== candidate.currency) reasons.push("currency_mismatch");
  if (principalAmountMinor <= 0n) reasons.push("invalid_principal");
  const amountMatch = absolute(candidate.amountMinor) === principalAmountMinor;
  if (!amountMatch) reasons.push("principal_mismatch");
  const eligible = reasons.length === 0;
  const days = Math.floor(
    Math.abs(
      Date.parse(`${transaction.bookingDate}T00:00:00Z`) -
        Date.parse(`${candidate.bookingDate}T00:00:00Z`),
    ) / 86_400_000,
  );
  const amountBps = amountMatch ? policy.weights.amount : 0;
  const dateBps =
    days > policy.dateToleranceDays
      ? 0
      : policy.dateToleranceDays === 0
        ? policy.weights.date
        : Math.floor(
            (policy.weights.date * (policy.dateToleranceDays + 1 - days)) /
              (policy.dateToleranceDays + 1),
          );
  const leftReference = normalizeText(transaction.reference);
  const rightReference = normalizeText(candidate.reference);
  const referenceBps =
    leftReference &&
    rightReference &&
    (leftReference.includes(rightReference) || rightReference.includes(leftReference))
      ? policy.weights.reference
      : 0;
  const currencyBps = transaction.currency === candidate.currency ? policy.weights.currency : 0;
  const ownAccountBps =
    transaction.financialAccountId !== candidate.financialAccountId ? policy.weights.ownAccount : 0;
  return Object.freeze({
    candidateTransactionId: candidate.id,
    eligible,
    totalBps: eligible ? amountBps + dateBps + referenceBps + currencyBps + ownAccountBps : 0,
    factors: Object.freeze({ amountBps, dateBps, referenceBps, currencyBps, ownAccountBps }),
    reasons: Object.freeze(reasons),
  });
}

export function decideTransferCandidate(
  transaction: OwnedTransferTransaction,
  candidates: readonly OwnedTransferTransaction[],
  principalAmountMinor: bigint,
  policy: TransferCandidatePolicy,
): TransferCandidateDecision {
  const scores = Object.freeze(
    candidates
      .map((candidate) =>
        scoreTransferCandidate(transaction, candidate, principalAmountMinor, policy),
      )
      .sort(
        (a, b) =>
          b.totalBps - a.totalBps ||
          a.candidateTransactionId.localeCompare(b.candidateTransactionId),
      ),
  );
  const above = scores.filter(
    (score) => score.eligible && score.totalBps >= policy.autoMatchThresholdBps,
  );
  if (above.length === 1) {
    return Object.freeze({
      outcome: "unique",
      candidateTransactionId: above[0]!.candidateTransactionId,
      scores,
    });
  }
  return Object.freeze({ outcome: above.length > 1 ? "ambiguous" : "none", scores });
}

function balanced(lines: readonly TransferJournalLine[]) {
  const debit = lines.reduce((sum, line) => sum + (line.debitMinor ?? 0n), 0n);
  const credit = lines.reduce((sum, line) => sum + (line.creditMinor ?? 0n), 0n);
  if (debit !== credit) throw new Error("Internal transfer journal must balance exactly");
  for (const line of lines) {
    if (line.accountRole !== "fee_expense" && !["bank", "transit"].includes(line.accountRole)) {
      throw new Error("Internal transfer principal cannot use a P&L account");
    }
  }
  return Object.freeze(lines);
}

export function buildInternalTransferJournalPlan(
  transfer: InternalTransfer,
): readonly TransferJournalDraft[] {
  const attempt = transfer.attempts.at(-1);
  if (!attempt) throw new Error("Internal transfer attempt is required");
  const source = attempt.source;
  const destination = attempt.destination;
  const fee = attempt.fee;
  const embeddedFeeBase = fee?.mode === "embedded" ? fee.baseAmountMinor : 0n;
  const drafts: TransferJournalDraft[] = [];
  if (source && destination && attempt.postingMode === "direct" && !attempt.journalIds.length) {
    drafts.push(
      Object.freeze({
        id: "direct-transfer",
        purpose: "direct_transfer" as const,
        lines: balanced([
          Object.freeze({
            id: "destination-bank",
            accountId: destination.transaction.ledgerAccountId,
            accountRole: "bank" as const,
            debitMinor: destination.baseAmountMinor,
          }),
          ...(fee?.mode === "embedded"
            ? [
                Object.freeze({
                  id: "bank-fee",
                  accountId: fee.expenseAccountId,
                  accountRole: "fee_expense" as const,
                  debitMinor: fee.baseAmountMinor,
                }),
              ]
            : []),
          Object.freeze({
            id: "source-bank",
            accountId: source.transaction.ledgerAccountId,
            accountRole: "bank" as const,
            creditMinor: source.baseAmountMinor + embeddedFeeBase,
          }),
        ]),
      }),
    );
  } else {
    if (source && !source.journalId && !attempt.journalIds.length) {
      drafts.push(
        Object.freeze({
          id: "source-to-transit",
          purpose: "source_to_transit" as const,
          lines: balanced([
            Object.freeze({
              id: "transit-debit",
              accountId: attempt.transitAccountId,
              accountRole: "transit" as const,
              debitMinor: source.baseAmountMinor,
            }),
            ...(fee?.mode === "embedded"
              ? [
                  Object.freeze({
                    id: "bank-fee",
                    accountId: fee.expenseAccountId,
                    accountRole: "fee_expense" as const,
                    debitMinor: fee.baseAmountMinor,
                  }),
                ]
              : []),
            Object.freeze({
              id: "source-bank",
              accountId: source.transaction.ledgerAccountId,
              accountRole: "bank" as const,
              creditMinor: source.baseAmountMinor + embeddedFeeBase,
            }),
          ]),
        }),
      );
    }
    if (destination && !destination.journalId) {
      drafts.push(
        Object.freeze({
          id: "transit-to-destination",
          purpose: "transit_to_destination" as const,
          lines: balanced([
            Object.freeze({
              id: "destination-bank",
              accountId: destination.transaction.ledgerAccountId,
              accountRole: "bank" as const,
              debitMinor: destination.baseAmountMinor,
            }),
            Object.freeze({
              id: "transit-credit",
              accountId: attempt.transitAccountId,
              accountRole: "transit" as const,
              creditMinor: destination.baseAmountMinor,
            }),
          ]),
        }),
      );
    }
  }
  if (fee?.mode === "separate_transaction" && !fee.journalId) {
    if (!source) throw new Error("Separate transfer fee requires the source account");
    drafts.push(
      Object.freeze({
        id: "separate-fee",
        purpose: "separate_fee" as const,
        lines: balanced([
          Object.freeze({
            id: "fee-expense",
            accountId: fee.expenseAccountId,
            accountRole: "fee_expense" as const,
            debitMinor: fee.baseAmountMinor,
          }),
          Object.freeze({
            id: "fee-bank",
            accountId: fee.transaction!.ledgerAccountId,
            accountRole: "bank" as const,
            creditMinor: fee.baseAmountMinor,
          }),
        ]),
      }),
    );
  }
  return Object.freeze(drafts);
}
