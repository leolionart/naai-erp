import { describe, expect, it } from "vitest";
import {
  approveStatementSuspenseException,
  closeBankStatementSession,
  createBankStatementSession,
  createStatementSuspenseException,
  rejectStatementSuspenseException,
  resolveStatementSuspenseException,
  reviewBankStatementSession,
  statementCloseBlockers,
  type StatementTransactionControl,
} from "./banking-controls.js";

const context = {
  actorId: "finance-1",
  occurredAt: "2026-08-31T17:00:00+07:00",
  reason: "Month-end statement control",
  correlationId: "corr-1",
};

const transaction = (
  overrides: Partial<StatementTransactionControl> = {},
): StatementTransactionControl => {
  const result: StatementTransactionControl = {
    id: "control-1",
    bankTransactionId: "bank-1",
    importId: "import-1",
    bookingDate: "2026-08-05",
    amountMinor: 100n,
    disposition: "accepted",
    controlStatus: "reconciled",
    ...overrides,
  };
  return ["unexplained", "suspense"].includes(result.controlStatus)
    ? result
    : { explanationReference: "reconciliation-1", ...result };
};

const session = (transactions: readonly StatementTransactionControl[] = [transaction()]) =>
  createBankStatementSession({
    organizationId: "org-1",
    id: "statement-1",
    financialAccountId: "bank-account-1",
    currency: "VND",
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
    openingBalanceMinor: 1_000n,
    closingBalanceMinor:
      1_000n +
      transactions
        .filter((item) => item.disposition === "accepted")
        .reduce((sum, item) => sum + item.amountMinor, 0n),
    importIds: ["import-1"],
    transactions,
    actorId: context.actorId,
    occurredAt: context.occurredAt,
    reason: context.reason,
    correlationId: context.correlationId,
  });

describe("bank statement control sessions", () => {
  it("computes exact expected movement from accepted transactions only", () => {
    const result = session([
      transaction(),
      transaction({
        id: "duplicate",
        bankTransactionId: "bank-duplicate",
        amountMinor: 999n,
        disposition: "duplicate",
        controlStatus: "ignored",
        dispositionReason: "Duplicate import row",
      }),
      transaction({
        id: "outflow",
        bankTransactionId: "bank-outflow",
        amountMinor: -40n,
        explanationReference: "reconciliation-2",
      }),
    ]);
    expect(result.expectedMovementMinor).toBe(60n);
    expect(result.controlDifferenceMinor).toBe(0n);
  });

  it("requires linked imports period membership and explicit duplicate reasons", () => {
    expect(() => session([transaction({ importId: "other-import" })])).toThrow("linked import");
    expect(() => session([transaction({ bookingDate: "2026-09-01" })])).toThrow(
      "outside the statement period",
    );
    expect(() =>
      session([transaction({ disposition: "duplicate", controlStatus: "ignored" })]),
    ).toThrow("disposition reason");
  });

  it("reviews and closes a statement only when the control equation ties", () => {
    const reviewed = reviewBankStatementSession(session(), context);
    const closed = closeBankStatementSession(reviewed, { ...context, reason: "Control complete" });
    expect(closed.state).toBe("closed");
    expect(closed.version).toBe(3);
    expect(closed.events.map((item) => item.action)).toEqual(["create", "review", "close"]);
  });

  it("blocks close for a control-total mismatch and unexplained accepted transaction", () => {
    const mismatched = {
      ...session([transaction({ controlStatus: "unexplained" })]),
      closingBalanceMinor: 1_099n,
      controlDifferenceMinor: 1n,
    };
    const reviewed = reviewBankStatementSession(mismatched, context);
    expect(statementCloseBlockers(reviewed)).toEqual([
      "control_total_mismatch",
      "unexplained_transaction:bank-1",
    ]);
    expect(() => closeBankStatementSession(reviewed, context)).toThrow("STATEMENT_CLOSE_BLOCKED");
  });

  it("requires every accepted suspense transaction to have a non-pending exception", () => {
    const draft = createBankStatementSession({
      organizationId: "org-1",
      id: "statement-1",
      financialAccountId: "bank-account-1",
      currency: "VND",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      openingBalanceMinor: 1_000n,
      closingBalanceMinor: 1_100n,
      importIds: ["import-1"],
      transactions: [transaction({ controlStatus: "suspense" })],
      ...context,
    });
    const reviewed = reviewBankStatementSession(draft, context);
    expect(statementCloseBlockers(reviewed)).toEqual(["missing_suspense_exception:bank-1"]);
    const withException = createStatementSuspenseException(reviewed, {
      id: "exception-1",
      bankTransactionId: "bank-1",
      amountMinor: 100n,
      ownerId: "finance-owner",
      reviewDue: "2026-09-05",
      ...context,
      reason: "Unknown receipt",
    });
    expect(statementCloseBlockers(withException)).toEqual(["unapproved_suspense:exception-1"]);
    const approved = approveStatementSuspenseException(withException, "exception-1", {
      ...context,
      reason: "Temporary approved suspense",
    });
    expect(statementCloseBlockers(approved)).toEqual([]);
    expect(closeBankStatementSession(approved, context).state).toBe("closed");
  });

  it("resolves pending or approved suspense with an append-only resolution reference", () => {
    const draft = createBankStatementSession({
      organizationId: "org-1",
      id: "statement-1",
      financialAccountId: "bank-account-1",
      currency: "VND",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      openingBalanceMinor: 1_000n,
      closingBalanceMinor: 1_100n,
      importIds: ["import-1"],
      transactions: [transaction({ controlStatus: "suspense" })],
      ...context,
    });
    const reviewed = reviewBankStatementSession(draft, context);
    const withException = createStatementSuspenseException(reviewed, {
      id: "exception-1",
      bankTransactionId: "bank-1",
      amountMinor: 100n,
      ownerId: "finance-owner",
      reviewDue: "2026-09-05",
      ...context,
      reason: "Unknown receipt",
    });
    const resolved = resolveStatementSuspenseException(withException, "exception-1", {
      ...context,
      reason: "Receipt identified",
      resolutionReference: "reconciliation-99",
    });
    expect(resolved.exceptions[0]).toMatchObject({
      state: "resolved",
      resolutionReference: "reconciliation-99",
    });
    expect(statementCloseBlockers(resolved)).toEqual([]);
  });

  it("keeps rejected suspense explicit and blocking until the transaction is otherwise explained", () => {
    const reviewed = reviewBankStatementSession(
      createBankStatementSession({
        organizationId: "org-1",
        id: "statement-1",
        financialAccountId: "bank-account-1",
        currency: "VND",
        periodStart: "2026-08-01",
        periodEnd: "2026-08-31",
        openingBalanceMinor: 1_000n,
        closingBalanceMinor: 1_100n,
        importIds: ["import-1"],
        transactions: [transaction({ controlStatus: "suspense" })],
        ...context,
      }),
      context,
    );
    const withException = createStatementSuspenseException(reviewed, {
      id: "exception-1",
      bankTransactionId: "bank-1",
      amountMinor: 100n,
      ownerId: "finance-owner",
      reviewDue: "2026-09-05",
      ...context,
      reason: "Unknown receipt",
    });
    const rejected = rejectStatementSuspenseException(withException, "exception-1", {
      ...context,
      reason: "Not an acceptable suspense item",
    });
    expect(rejected.exceptions[0]?.state).toBe("rejected");
    expect(statementCloseBlockers(rejected)).toEqual(["rejected_suspense:exception-1"]);
  });
});
