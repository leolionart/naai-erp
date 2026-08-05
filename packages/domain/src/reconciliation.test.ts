import { describe, expect, it } from "vitest";
import {
  authorizeUnreconcile,
  buildReconciliationJournalLines,
  createMatchedReconciliation,
  decideAutoMatch,
  reconcilePayment,
  scoreReconciliationCandidate,
  type MatchingPolicy,
  type ReconciliationCandidate,
} from "./reconciliation.js";

const policy: MatchingPolicy = {
  version: 1,
  dateToleranceDays: 3,
  autoMatchThresholdBps: 8_000,
  weights: {
    amount: 3_000,
    date: 1_500,
    reference: 2_000,
    party: 1_000,
    currency: 1_000,
    outstanding: 1_500,
  },
};
const transaction = {
  id: "bank-tx-1",
  state: "imported" as const,
  amountMinor: 60_000_000n,
  currency: "VND",
  bookingDate: "2026-02-05",
  reference: "SI-2026-0001 CLIENT A",
  partyId: "CLIENT-A",
};
const candidate = (id: string): ReconciliationCandidate => ({
  id,
  targetKind: "sales_invoice",
  targetId: "sales-001",
  direction: "receipt",
  currency: "VND",
  outstandingMinor: 60_000_000n,
  documentDate: "2026-02-04",
  reference: "SI-2026-0001",
  partyId: "CLIENT-A",
});

describe("ERP-410 reconciliation domain", () => {
  it("scores explainable integer-bps factors and only auto-matches one unique candidate", () => {
    const score = scoreReconciliationCandidate(transaction, candidate("candidate-a"), policy);
    expect(score.eligible).toBe(true);
    expect(Number.isInteger(score.totalBps)).toBe(true);
    expect(score.factors).toMatchObject({ amountBps: 3000, currencyBps: 1000 });
    expect(decideAutoMatch(transaction, [candidate("candidate-a")], policy)).toMatchObject({
      outcome: "unique",
      candidateId: "candidate-a",
    });
    expect(
      decideAutoMatch(transaction, [candidate("candidate-a"), candidate("candidate-b")], policy)
        .outcome,
    ).toBe("ambiguous");
  });

  it("rejects direction currency and exhausted-outstanding candidates", () => {
    expect(
      scoreReconciliationCandidate(
        transaction,
        { ...candidate("bad"), direction: "payment", currency: "USD", outstandingMinor: 0n },
        policy,
      ),
    ).toMatchObject({ eligible: false, totalBps: 0 });
  });

  it("supports a partial source settlement but never overallocates transaction or source capacity", () => {
    const matched = createMatchedReconciliation({
      organizationId: "org-a",
      id: "rec-1",
      transaction: { ...transaction, state: "suggested" },
      allocations: [
        {
          lineNumber: 1,
          targetKind: "sales_invoice",
          targetId: "sales-001",
          controlAccountId: "131-AR",
          statementAmountMinor: 60_000_000n,
          targetAmountMinor: 60_000_000n,
          baseAmountMinor: 60_000_000n,
          targetOutstandingBeforeMinor: 110_000_000n,
        },
      ],
      policyVersion: 1,
      candidateGeneration: 1,
      bankBaseAmountMinor: 60_000_000n,
    });
    expect(matched.attempts[0]?.state).toBe("matched");
    expect(() =>
      createMatchedReconciliation({
        organizationId: "org-a",
        id: "bad",
        transaction: { ...transaction, state: "suggested" },
        allocations: [
          {
            lineNumber: 1,
            targetKind: "sales_invoice",
            targetId: "sales-001",
            controlAccountId: "131-AR",
            statementAmountMinor: 60_000_000n,
            targetAmountMinor: 60_000_001n,
            baseAmountMinor: 60_000_001n,
            targetOutstandingBeforeMinor: 110_000_000n,
          },
        ],
        alreadyAllocatedByTarget: { "sales-001": 50_000_000n },
        policyVersion: 1,
        candidateGeneration: 1,
        bankBaseAmountMinor: 60_000_000n,
      }),
    ).toThrow("exceeds target outstanding");
  });

  it("preserves transaction and target capacities across generated partial allocations", () => {
    for (let statement = 1n; statement <= 100n; statement += 1n) {
      const outstanding = statement + 25n;
      expect(() =>
        createMatchedReconciliation({
          organizationId: "org-a",
          id: `generated-${statement}`,
          transaction: {
            id: `tx-${statement}`,
            state: "suggested",
            amountMinor: statement,
            currency: "VND",
            bookingDate: "2026-02-05",
          },
          allocations: [
            {
              lineNumber: 1,
              targetKind: "sales_invoice",
              targetId: `invoice-${statement}`,
              controlAccountId: "131-AR",
              statementAmountMinor: statement,
              targetAmountMinor: statement,
              baseAmountMinor: statement,
              targetOutstandingBeforeMinor: outstanding,
            },
          ],
          policyVersion: 1,
          candidateGeneration: 1,
          bankBaseAmountMinor: statement,
        }),
      ).not.toThrow();
    }
  });

  it("requires a reason when an ambiguous or below-threshold candidate is manually selected", () => {
    expect(() =>
      createMatchedReconciliation({
        organizationId: "org-a",
        id: "manual-1",
        transaction: { ...transaction, state: "needs_review" },
        allocations: [
          {
            lineNumber: 1,
            targetKind: "sales_invoice",
            targetId: "sales-001",
            controlAccountId: "131-AR",
            statementAmountMinor: 60_000_000n,
            targetAmountMinor: 60_000_000n,
            baseAmountMinor: 60_000_000n,
            targetOutstandingBeforeMinor: 110_000_000n,
          },
        ],
        policyVersion: 1,
        candidateGeneration: 1,
        bankBaseAmountMinor: 60_000_000n,
        manualOverrideRequired: true,
      }),
    ).toThrow("Manual override reason is required");
  });

  it("creates a balanced 109m payable plus explicit 1m fee payment journal", () => {
    const matched = createMatchedReconciliation({
      organizationId: "org-a",
      id: "rec-fee",
      transaction: {
        id: "bank-payment",
        state: "suggested",
        amountMinor: -110_000_000n,
        currency: "VND",
        bookingDate: "2026-02-10",
      },
      allocations: [
        {
          lineNumber: 1,
          targetKind: "purchase_invoice",
          targetId: "purchase-001",
          controlAccountId: "331-AP",
          statementAmountMinor: 109_000_000n,
          targetAmountMinor: 109_000_000n,
          baseAmountMinor: 109_000_000n,
          targetOutstandingBeforeMinor: 109_000_000n,
        },
      ],
      adjustments: [
        {
          lineNumber: 2,
          kind: "bank_fee",
          accountId: "642-BANK-FEE",
          side: "debit",
          statementAmountMinor: 1_000_000n,
          baseAmountMinor: 1_000_000n,
          reason: "Transfer fee",
        },
      ],
      policyVersion: 1,
      candidateGeneration: 1,
      bankBaseAmountMinor: 110_000_000n,
    });
    expect(buildReconciliationJournalLines(matched, "1121-BANK")).toEqual([
      expect.objectContaining({ accountId: "1121-BANK", creditMinor: 110_000_000n }),
      expect.objectContaining({ accountId: "331-AP", debitMinor: 109_000_000n }),
      expect.objectContaining({ accountId: "642-BANK-FEE", debitMinor: 1_000_000n }),
    ]);
  });

  it("locks reconciliation until privileged unreconcile records reason and reversal", () => {
    const matched = createMatchedReconciliation({
      organizationId: "org-a",
      id: "rec-1",
      transaction: { ...transaction, state: "suggested" },
      allocations: [
        {
          lineNumber: 1,
          targetKind: "sales_invoice",
          targetId: "sales-001",
          controlAccountId: "131-AR",
          statementAmountMinor: 60_000_000n,
          targetAmountMinor: 60_000_000n,
          baseAmountMinor: 60_000_000n,
          targetOutstandingBeforeMinor: 110_000_000n,
        },
      ],
      policyVersion: 1,
      candidateGeneration: 1,
      bankBaseAmountMinor: 60_000_000n,
    });
    const reconciled = reconcilePayment(matched, {
      journalId: "journal-payment-1",
      actorId: "accountant-a",
      reason: "Statement checked",
    });
    expect(() =>
      authorizeUnreconcile(reconciled, {
        actorId: "viewer-a",
        actorRoles: ["viewer"],
        reason: "Try",
        reversalJournalId: "reverse-1",
      }),
    ).toThrow("Authorized finance role");
    expect(
      authorizeUnreconcile(reconciled, {
        actorId: "finance-a",
        actorRoles: ["finance_admin"],
        reason: "Wrong source invoice",
        reversalJournalId: "reverse-1",
      }).attempts.at(-1),
    ).toMatchObject({ state: "unreconciled", reversalJournalId: "reverse-1" });
  });
});
