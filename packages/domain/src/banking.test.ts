import { describe, expect, it } from "vitest";
import {
  appendBankTransactionNormalization,
  bankTransactionSourceKey,
  buildBankTransactionFingerprintMaterial,
  createBankAccount,
  createBankTransaction,
  createBankTransactionNormalization,
  transitionBankTransaction,
} from "./banking.js";

const normalized = (version = 1) =>
  createBankTransactionNormalization({
    version,
    adapterId: "generic_csv",
    adapterVersion: version,
    bookingDate: "2026-08-05",
    amountMinor: -125000n,
    currency: "VND",
    reference: "Hosting fee",
  });

describe("ERP-400 banking domain", () => {
  it("distinguishes own bank and cash accounts from party bank details", () => {
    expect(
      createBankAccount({
        organizationId: "org-a",
        id: "ba-1",
        code: "VCB-VND",
        name: "Vietcombank operating",
        kind: "bank",
        currency: "VND",
        ledgerAccountId: "1121",
        bankCode: "VCB",
        accountIdentifier: "****1234",
        provider: "vcb_csv",
      }),
    ).toMatchObject({ status: "active", kind: "bank" });
    expect(() =>
      createBankAccount({
        organizationId: "org-a",
        id: "cash-1",
        code: "CASH",
        name: "Petty cash",
        kind: "cash",
        currency: "VND",
        ledgerAccountId: "1111",
        bankCode: "VCB",
      }),
    ).toThrow("Cash accounts cannot contain bank provider details");
  });

  it("prefers provider IDs and otherwise uses a canonical SHA-256 fingerprint", () => {
    expect(bankTransactionSourceKey({ providerTransactionId: " tx-001 " })).toBe("provider:tx-001");
    const first = buildBankTransactionFingerprintMaterial({
      bookingDate: "2026-08-05",
      amountMinor: -125000n,
      currency: "vnd",
      reference: " hosting   fee ",
    });
    const equivalent = buildBankTransactionFingerprintMaterial({
      bookingDate: "2026-08-05",
      amountMinor: -125000n,
      currency: "VND",
      reference: "HOSTING FEE",
    });
    expect(first).toBe(equivalent);
    const hash = "c".repeat(64);
    expect(bankTransactionSourceKey({ fingerprintSha256: hash })).toBe(`fingerprint:${hash}`);
  });

  it("copies and freezes immutable raw payload while appending normalized versions", () => {
    const raw = { reference: "raw", nested: { amount: "125000" } };
    const transaction = createBankTransaction({
      organizationId: "org-a",
      id: "txn-1",
      bankAccountId: "ba-1",
      providerTransactionId: "provider-1",
      rawPayloadHash: "a".repeat(64),
      rawPayload: raw,
      normalization: normalized(),
    });
    raw.nested.amount = "changed";
    expect(transaction.raw.payload).toMatchObject({ nested: { amount: "125000" } });
    expect(Object.isFrozen(transaction.raw.payload)).toBe(true);
    const next = appendBankTransactionNormalization(transaction, normalized(2));
    expect(next.normalizations.map((item) => item.version)).toEqual([1, 2]);
    expect(transaction.normalizations).toHaveLength(1);
    expect(() => appendBankTransactionNormalization(transaction, normalized(3))).toThrow(
      "Normalization version must be 2",
    );
  });

  it("enforces the BR-BNK-002 sequence without implementing reconciliation effects", () => {
    const imported = createBankTransaction({
      organizationId: "org-a",
      id: "txn-1",
      bankAccountId: "ba-1",
      fingerprintSha256: "b".repeat(64),
      rawPayloadHash: "a".repeat(64),
      rawPayload: { row: 1 },
      normalization: normalized(),
    });
    expect(() => transitionBankTransaction(imported, "matched")).toThrow(
      "Invalid bank transaction transition",
    );
    const suggested = transitionBankTransaction(imported, "suggested");
    const matched = transitionBankTransaction(suggested, "matched");
    const reconciled = transitionBankTransaction(matched, "reconciled");
    expect(reconciled.state).toBe("reconciled");
    expect(() => transitionBankTransaction(reconciled, "needs_review")).toThrow(
      "Invalid bank transaction transition",
    );
  });
});
