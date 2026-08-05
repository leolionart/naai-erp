export const BANK_STATEMENT_SESSION_STATES = ["draft", "reviewed", "closed"] as const;
export type BankStatementSessionState = (typeof BANK_STATEMENT_SESSION_STATES)[number];

export const STATEMENT_TRANSACTION_DISPOSITIONS = ["accepted", "duplicate", "excluded"] as const;
export type StatementTransactionDisposition = (typeof STATEMENT_TRANSACTION_DISPOSITIONS)[number];

export const STATEMENT_CONTROL_STATUSES = [
  "unexplained",
  "reconciled",
  "internal_transfer",
  "ignored",
  "suspense",
] as const;
export type StatementControlStatus = (typeof STATEMENT_CONTROL_STATUSES)[number];

export type SuspenseExceptionState = "pending" | "approved" | "resolved" | "rejected";

export type StatementTransactionControl = Readonly<{
  id: string;
  bankTransactionId: string;
  importId: string;
  bookingDate: string;
  amountMinor: bigint;
  disposition: StatementTransactionDisposition;
  controlStatus: StatementControlStatus;
  explanationReference?: string;
  dispositionReason?: string;
}>;

export type StatementSuspenseException = Readonly<{
  id: string;
  bankTransactionId: string;
  amountMinor: bigint;
  reason: string;
  ownerId: string;
  reviewDue: string;
  state: SuspenseExceptionState;
  createdBy: string;
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
  approvalReason?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  resolutionReference?: string;
  resolutionReason?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
}>;

export type BankStatementControlEvent = Readonly<{
  sequence: number;
  action:
    | "create"
    | "review"
    | "create_exception"
    | "approve_exception"
    | "resolve_exception"
    | "reject_exception"
    | "close";
  actorId: string;
  occurredAt: string;
  reason: string;
  correlationId: string;
}>;

export type BankStatementSession = Readonly<{
  organizationId: string;
  id: string;
  financialAccountId: string;
  currency: string;
  periodStart: string;
  periodEnd: string;
  openingBalanceMinor: bigint;
  closingBalanceMinor: bigint;
  expectedMovementMinor: bigint;
  controlDifferenceMinor: bigint;
  importIds: readonly string[];
  transactions: readonly StatementTransactionControl[];
  exceptions: readonly StatementSuspenseException[];
  state: BankStatementSessionState;
  version: number;
  events: readonly BankStatementControlEvent[];
  reviewedBy?: string;
  reviewedAt?: string;
  closedBy?: string;
  closedAt?: string;
}>;

const required = (value: string, label: string): string => {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
};

function isoDate(value: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`${label} must be an ISO date`);
  }
  return value;
}

function timestamp(value: string, label: string): string {
  if (Number.isNaN(Date.parse(value))) throw new Error(`${label} must be an ISO timestamp`);
  return value;
}

function currency(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) throw new Error("Statement currency must be ISO-4217");
  return normalized;
}

function event(
  session: BankStatementSession | undefined,
  action: BankStatementControlEvent["action"],
  input: { actorId: string; occurredAt: string; reason: string; correlationId: string },
): BankStatementControlEvent {
  return Object.freeze({
    sequence: (session?.events.length ?? 0) + 1,
    action,
    actorId: required(input.actorId, "Statement control actor"),
    occurredAt: timestamp(input.occurredAt, "Statement control event time"),
    reason: required(input.reason, "Statement control reason"),
    correlationId: required(input.correlationId, "Statement control correlation ID"),
  });
}

function expectedMovement(transactions: readonly StatementTransactionControl[]): bigint {
  return transactions
    .filter((transaction) => transaction.disposition === "accepted")
    .reduce((sum, transaction) => sum + transaction.amountMinor, 0n);
}

function checkedTransactions(
  transactions: readonly StatementTransactionControl[],
  importIds: readonly string[],
  periodStart: string,
  periodEnd: string,
): readonly StatementTransactionControl[] {
  const ids = new Set<string>();
  const bankIds = new Set<string>();
  return Object.freeze(
    transactions.map((transaction) => {
      const id = required(transaction.id, "Statement transaction control ID");
      const bankTransactionId = required(
        transaction.bankTransactionId,
        "Statement bank transaction ID",
      );
      if (ids.has(id) || bankIds.has(bankTransactionId)) {
        throw new Error("Statement transactions must be unique");
      }
      ids.add(id);
      bankIds.add(bankTransactionId);
      if (!importIds.includes(transaction.importId)) {
        throw new Error("Statement transaction must belong to a linked import");
      }
      const bookingDate = isoDate(transaction.bookingDate, "Statement transaction booking date");
      if (bookingDate < periodStart || bookingDate > periodEnd) {
        throw new Error("Statement transaction falls outside the statement period");
      }
      if (transaction.amountMinor === 0n) throw new Error("Statement transaction cannot be zero");
      if (transaction.disposition !== "accepted" && !transaction.dispositionReason?.trim()) {
        throw new Error("Duplicate or excluded transaction requires a disposition reason");
      }
      if (
        transaction.disposition === "accepted" &&
        ["reconciled", "internal_transfer", "ignored"].includes(transaction.controlStatus) &&
        !transaction.explanationReference?.trim()
      ) {
        throw new Error("Explained transaction requires an explanation reference");
      }
      return Object.freeze({ ...transaction, id, bankTransactionId, bookingDate });
    }),
  );
}

export function createBankStatementSession(input: {
  organizationId: string;
  id: string;
  financialAccountId: string;
  currency: string;
  periodStart: string;
  periodEnd: string;
  openingBalanceMinor: bigint;
  closingBalanceMinor: bigint;
  importIds: readonly string[];
  transactions: readonly StatementTransactionControl[];
  actorId: string;
  occurredAt: string;
  reason: string;
  correlationId: string;
}): BankStatementSession {
  const periodStart = isoDate(input.periodStart, "Statement period start");
  const periodEnd = isoDate(input.periodEnd, "Statement period end");
  if (periodEnd < periodStart) throw new Error("Statement period end cannot precede start");
  const importIds = Object.freeze(
    [...new Set(input.importIds.map((id) => required(id, "Statement import ID")))].sort(),
  );
  if (!importIds.length) throw new Error("Statement session requires at least one linked import");
  const transactions = checkedTransactions(input.transactions, importIds, periodStart, periodEnd);
  const movement = expectedMovement(transactions);
  const created = event(undefined, "create", input);
  return Object.freeze({
    organizationId: required(input.organizationId, "Statement organization ID"),
    id: required(input.id, "Statement session ID"),
    financialAccountId: required(input.financialAccountId, "Statement financial account ID"),
    currency: currency(input.currency),
    periodStart,
    periodEnd,
    openingBalanceMinor: input.openingBalanceMinor,
    closingBalanceMinor: input.closingBalanceMinor,
    expectedMovementMinor: movement,
    controlDifferenceMinor: input.openingBalanceMinor + movement - input.closingBalanceMinor,
    importIds,
    transactions,
    exceptions: Object.freeze([]),
    state: "draft",
    version: 1,
    events: Object.freeze([created]),
  });
}

export function createStatementSuspenseException(
  session: BankStatementSession,
  input: {
    id: string;
    bankTransactionId: string;
    amountMinor: bigint;
    ownerId: string;
    reviewDue: string;
    actorId: string;
    occurredAt: string;
    reason: string;
    correlationId: string;
  },
): BankStatementSession {
  if (session.state !== "reviewed") {
    throw new Error("Suspense exceptions can only be created during statement review");
  }
  const id = required(input.id, "Suspense exception ID");
  if (session.exceptions.some((exception) => exception.id === id)) {
    throw new Error("Suspense exception ID already exists");
  }
  if (
    session.exceptions.some(
      (exception) =>
        exception.bankTransactionId === input.bankTransactionId && exception.state !== "rejected",
    )
  ) {
    throw new Error("Statement transaction already has an active suspense exception");
  }
  const transaction = session.transactions.find(
    (candidate) => candidate.bankTransactionId === input.bankTransactionId,
  );
  if (
    !transaction ||
    transaction.disposition !== "accepted" ||
    transaction.controlStatus !== "suspense"
  ) {
    throw new Error("Suspense exception must reference an accepted suspense transaction");
  }
  if (transaction.amountMinor !== input.amountMinor) {
    throw new Error("Suspense exception amount must equal its statement transaction");
  }
  const created = event(session, "create_exception", input);
  const exception: StatementSuspenseException = Object.freeze({
    id,
    bankTransactionId: transaction.bankTransactionId,
    amountMinor: input.amountMinor,
    reason: created.reason,
    ownerId: required(input.ownerId, "Suspense exception owner"),
    reviewDue: isoDate(input.reviewDue, "Suspense exception review due date"),
    state: "pending",
    createdBy: created.actorId,
    createdAt: created.occurredAt,
  });
  return Object.freeze({
    ...session,
    version: session.version + 1,
    exceptions: Object.freeze([...session.exceptions, exception]),
    events: Object.freeze([...session.events, created]),
  });
}

export function reviewBankStatementSession(
  session: BankStatementSession,
  input: { actorId: string; occurredAt: string; reason: string; correlationId: string },
): BankStatementSession {
  if (session.state !== "draft") throw new Error("Only draft statement sessions can be reviewed");
  const reviewed = event(session, "review", input);
  return Object.freeze({
    ...session,
    state: "reviewed",
    version: session.version + 1,
    events: Object.freeze([...session.events, reviewed]),
    reviewedBy: reviewed.actorId,
    reviewedAt: reviewed.occurredAt,
  });
}

export function approveStatementSuspenseException(
  session: BankStatementSession,
  exceptionId: string,
  input: { actorId: string; occurredAt: string; reason: string; correlationId: string },
): BankStatementSession {
  if (session.state !== "reviewed") {
    throw new Error("Suspense exceptions can only be approved during statement review");
  }
  const id = required(exceptionId, "Suspense exception ID");
  const found = session.exceptions.find((exception) => exception.id === id);
  if (!found) throw new Error("Suspense exception not found");
  if (found.state !== "pending") throw new Error("Only pending suspense can be approved");
  const approved = event(session, "approve_exception", input);
  return Object.freeze({
    ...session,
    version: session.version + 1,
    exceptions: Object.freeze(
      session.exceptions.map((exception) =>
        exception.id === id
          ? Object.freeze({
              ...exception,
              state: "approved" as const,
              approvedBy: approved.actorId,
              approvedAt: approved.occurredAt,
              approvalReason: approved.reason,
            })
          : exception,
      ),
    ),
    events: Object.freeze([...session.events, approved]),
  });
}

export function resolveStatementSuspenseException(
  session: BankStatementSession,
  exceptionId: string,
  input: {
    actorId: string;
    occurredAt: string;
    reason: string;
    correlationId: string;
    resolutionReference: string;
  },
): BankStatementSession {
  if (session.state !== "reviewed") {
    throw new Error("Suspense exceptions can only be resolved during statement review");
  }
  const id = required(exceptionId, "Suspense exception ID");
  const found = session.exceptions.find((exception) => exception.id === id);
  if (!found) throw new Error("Suspense exception not found");
  if (found.state === "resolved" || found.state === "rejected") {
    throw new Error("Resolved or rejected suspense exception cannot be resolved");
  }
  const resolved = event(session, "resolve_exception", input);
  const resolutionReference = required(input.resolutionReference, "Suspense resolution reference");
  return Object.freeze({
    ...session,
    version: session.version + 1,
    exceptions: Object.freeze(
      session.exceptions.map((exception) =>
        exception.id === id
          ? Object.freeze({
              ...exception,
              state: "resolved" as const,
              resolvedBy: resolved.actorId,
              resolvedAt: resolved.occurredAt,
              resolutionReference,
              resolutionReason: resolved.reason,
            })
          : exception,
      ),
    ),
    events: Object.freeze([...session.events, resolved]),
  });
}

export function rejectStatementSuspenseException(
  session: BankStatementSession,
  exceptionId: string,
  input: { actorId: string; occurredAt: string; reason: string; correlationId: string },
): BankStatementSession {
  if (session.state !== "reviewed") {
    throw new Error("Suspense exceptions can only be rejected during statement review");
  }
  const id = required(exceptionId, "Suspense exception ID");
  const found = session.exceptions.find((exception) => exception.id === id);
  if (!found) throw new Error("Suspense exception not found");
  if (found.state === "resolved" || found.state === "rejected") {
    throw new Error("Resolved or rejected suspense exception cannot be rejected");
  }
  const rejected = event(session, "reject_exception", input);
  return Object.freeze({
    ...session,
    version: session.version + 1,
    exceptions: Object.freeze(
      session.exceptions.map((exception) =>
        exception.id === id
          ? Object.freeze({
              ...exception,
              state: "rejected" as const,
              rejectedBy: rejected.actorId,
              rejectedAt: rejected.occurredAt,
              rejectionReason: rejected.reason,
            })
          : exception,
      ),
    ),
    events: Object.freeze([...session.events, rejected]),
  });
}

export function statementCloseBlockers(session: BankStatementSession): readonly string[] {
  const blockers: string[] = [];
  if (session.state !== "reviewed") blockers.push("statement_not_reviewed");
  if (!session.importIds.length) blockers.push("no_linked_imports");
  if (session.controlDifferenceMinor !== 0n) blockers.push("control_total_mismatch");
  const exceptionByTransaction = new Map(
    session.exceptions.map((exception) => [exception.bankTransactionId, exception]),
  );
  for (const transaction of session.transactions) {
    if (transaction.disposition !== "accepted") continue;
    if (transaction.controlStatus === "unexplained") {
      blockers.push(`unexplained_transaction:${transaction.bankTransactionId}`);
    } else if (transaction.controlStatus === "suspense") {
      const exception = exceptionByTransaction.get(transaction.bankTransactionId);
      if (!exception) blockers.push(`missing_suspense_exception:${transaction.bankTransactionId}`);
      else if (exception.state === "pending") {
        blockers.push(`unapproved_suspense:${exception.id}`);
      } else if (exception.state === "rejected") {
        blockers.push(`rejected_suspense:${exception.id}`);
      }
    }
  }
  return Object.freeze([...new Set(blockers)].sort());
}

export function closeBankStatementSession(
  session: BankStatementSession,
  input: { actorId: string; occurredAt: string; reason: string; correlationId: string },
): BankStatementSession {
  const blockers = statementCloseBlockers(session);
  if (blockers.length) throw new Error(`STATEMENT_CLOSE_BLOCKED:${blockers.join(",")}`);
  const closed = event(session, "close", input);
  return Object.freeze({
    ...session,
    state: "closed",
    version: session.version + 1,
    events: Object.freeze([...session.events, closed]),
    closedBy: closed.actorId,
    closedAt: closed.occurredAt,
  });
}
