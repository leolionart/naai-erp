import { describe, expect, it } from "vitest";
import {
  authorizeUnmatchInternalTransfer,
  buildInternalTransferJournalPlan,
  createInternalTransfer,
  decideTransferCandidate,
  matchInternalTransfer,
  recordInternalTransferPosting,
  type OwnedTransferTransaction,
  type TransferCandidatePolicy,
} from "./internal-transfers.js";

const source: OwnedTransferTransaction = {
  id: "bank-out-101",
  financialAccountId: "vcb",
  ledgerAccountId: "1121-VCB",
  amountMinor: -101_000_000n,
  currency: "VND",
  bookingDate: "2026-02-10",
  reference: "Internal transfer NAAI",
  state: "imported",
};
const destination: OwnedTransferTransaction = {
  id: "bank-in-100",
  financialAccountId: "tcb",
  ledgerAccountId: "1121-TCB",
  amountMinor: 100_000_000n,
  currency: "VND",
  bookingDate: "2026-02-10",
  reference: "Internal transfer NAAI",
  state: "imported",
};
const fee = {
  mode: "embedded" as const,
  amountMinor: 1_000_000n,
  baseAmountMinor: 1_000_000n,
  expenseAccountId: "642-BANK-FEE",
  reason: "Transfer fee",
};
const command = {
  actorId: "finance-a",
  reason: "Own-account transfer",
  idempotencyKey: "transfer-create-1",
  commandFingerprint: "a".repeat(64),
};

describe("ERP-420 internal transfer domain", () => {
  it("builds a direct principal transfer with the 1m fee as the only P&L line", () => {
    const transfer = createInternalTransfer({
      organizationId: "org-a",
      id: "transfer-1",
      principalAmountMinor: 100_000_000n,
      basePrincipalAmountMinor: 100_000_000n,
      currency: "VND",
      source,
      destination,
      fee,
      transitAccountId: "1388-TRANSIT",
      ...command,
    });
    const plan = buildInternalTransferJournalPlan(transfer);
    expect(plan).toHaveLength(1);
    expect(plan[0]?.lines).toEqual([
      expect.objectContaining({ accountRole: "bank", debitMinor: 100_000_000n }),
      expect.objectContaining({ accountRole: "fee_expense", debitMinor: 1_000_000n }),
      expect.objectContaining({ accountRole: "bank", creditMinor: 101_000_000n }),
    ]);
  });

  it("supports a separately imported fee transaction without folding it into principal", () => {
    const sourcePrincipal = { ...source, amountMinor: -100_000_000n };
    const feeTransaction: OwnedTransferTransaction = {
      ...source,
      id: "bank-fee-1",
      amountMinor: -1_000_000n,
      reference: "Transfer fee",
    };
    const transfer = createInternalTransfer({
      organizationId: "org-a",
      id: "transfer-separate-fee",
      principalAmountMinor: 100_000_000n,
      basePrincipalAmountMinor: 100_000_000n,
      currency: "VND",
      source: sourcePrincipal,
      destination,
      fee: {
        mode: "separate_transaction",
        amountMinor: 1_000_000n,
        baseAmountMinor: 1_000_000n,
        expenseAccountId: "642-BANK-FEE",
        reason: "Transfer fee",
        transactionId: feeTransaction.id,
        transaction: feeTransaction,
      },
      transitAccountId: "1388-TRANSIT",
      ...command,
    });
    expect(buildInternalTransferJournalPlan(transfer).map((item) => item.purpose)).toEqual([
      "direct_transfer",
      "separate_fee",
    ]);
  });

  it("supports one-sided transit then produces an exactly clearing counterpart plan", () => {
    const pending = createInternalTransfer({
      organizationId: "org-a",
      id: "transfer-1",
      principalAmountMinor: 100_000_000n,
      basePrincipalAmountMinor: 100_000_000n,
      currency: "VND",
      source,
      fee,
      transitAccountId: "1388-TRANSIT",
      ...command,
    });
    expect(pending.attempts[0]?.state).toBe("pending_counterpart");
    expect(buildInternalTransferJournalPlan(pending)[0]?.lines).toEqual([
      expect.objectContaining({ accountRole: "transit", debitMinor: 100_000_000n }),
      expect.objectContaining({ accountRole: "fee_expense", debitMinor: 1_000_000n }),
      expect.objectContaining({ accountRole: "bank", creditMinor: 101_000_000n }),
    ]);
    const posted = recordInternalTransferPosting(pending, {
      journalIds: ["journal-source-transit"],
      actorId: "finance-a",
      reason: "Source side posted to transit",
      idempotencyKey: "post-source-1",
      commandFingerprint: "b".repeat(64),
    });
    const matched = matchInternalTransfer(posted, {
      counterpart: destination,
      actorId: "finance-a",
      reason: "Destination side imported",
      idempotencyKey: "match-destination-1",
      commandFingerprint: "c".repeat(64),
    });
    expect(buildInternalTransferJournalPlan(matched)).toEqual([
      expect.objectContaining({
        purpose: "transit_to_destination",
        lines: [
          expect.objectContaining({ accountRole: "bank", debitMinor: 100_000_000n }),
          expect.objectContaining({ accountRole: "transit", creditMinor: 100_000_000n }),
        ],
      }),
    ]);
  });

  it("does not infer FX or hide a statement mismatch", () => {
    expect(() =>
      createInternalTransfer({
        organizationId: "org-a",
        id: "fx-transfer",
        principalAmountMinor: 100_000_000n,
        basePrincipalAmountMinor: 100_000_000n,
        currency: "VND",
        source,
        destination: { ...destination, currency: "USD" },
        fee,
        transitAccountId: "1388-TRANSIT",
        ...command,
      }),
    ).toThrow("Cross-currency");
    expect(() =>
      createInternalTransfer({
        organizationId: "org-a",
        id: "hidden-fee",
        principalAmountMinor: 100_000_000n,
        basePrincipalAmountMinor: 100_000_000n,
        currency: "VND",
        source,
        destination,
        transitAccountId: "1388-TRANSIT",
        ...command,
      }),
    ).toThrow("explicit principal and fee");
  });

  it("scores one unique opposite-account counterpart and marks ambiguity", () => {
    const policy: TransferCandidatePolicy = {
      version: 1,
      dateToleranceDays: 2,
      autoMatchThresholdBps: 8_000,
      weights: { amount: 4_000, date: 2_000, reference: 2_000, currency: 1_000, ownAccount: 1_000 },
    };
    expect(decideTransferCandidate(source, [destination], 100_000_000n, policy)).toMatchObject({
      outcome: "unique",
      candidateTransactionId: destination.id,
    });
    expect(
      decideTransferCandidate(
        source,
        [destination, { ...destination, id: "bank-in-100-b", financialAccountId: "mbb" }],
        100_000_000n,
        policy,
      ).outcome,
    ).toBe("ambiguous");
  });

  it("makes match idempotent and requires privileged full reversal before reconciled unmatch", () => {
    const pending = createInternalTransfer({
      organizationId: "org-a",
      id: "transfer-1",
      principalAmountMinor: 100_000_000n,
      basePrincipalAmountMinor: 100_000_000n,
      currency: "VND",
      source,
      fee,
      transitAccountId: "1388-TRANSIT",
      ...command,
    });
    const matchInput = {
      counterpart: destination,
      actorId: "finance-a",
      reason: "Destination imported",
      idempotencyKey: "match-1",
      commandFingerprint: "d".repeat(64),
    };
    const matched = matchInternalTransfer(pending, matchInput);
    expect(matchInternalTransfer(matched, matchInput)).toBe(matched);
    const reconciled = recordInternalTransferPosting(matched, {
      journalIds: ["journal-direct"],
      actorId: "finance-a",
      reason: "Transfer reconciled",
      idempotencyKey: "post-1",
      commandFingerprint: "e".repeat(64),
    });
    expect(() =>
      authorizeUnmatchInternalTransfer(reconciled, {
        actorId: "viewer-a",
        actorRoles: ["viewer"],
        reason: "Wrong pair",
        idempotencyKey: "unmatch-1",
        commandFingerprint: "f".repeat(64),
      }),
    ).toThrow("Authorized finance role");
    expect(() =>
      authorizeUnmatchInternalTransfer(reconciled, {
        actorId: "finance-a",
        actorRoles: ["finance_admin"],
        reason: "Wrong pair",
        idempotencyKey: "unmatch-1",
        commandFingerprint: "f".repeat(64),
      }),
    ).toThrow("reversal for every posted journal");
    expect(
      authorizeUnmatchInternalTransfer(reconciled, {
        actorId: "finance-a",
        actorRoles: ["finance_admin"],
        reason: "Wrong pair",
        idempotencyKey: "unmatch-1",
        commandFingerprint: "f".repeat(64),
        reversalJournalIds: ["journal-reversal"],
      }).attempts.at(-1),
    ).toMatchObject({ state: "unmatched", reversalJournalIds: ["journal-reversal"] });
  });
});
