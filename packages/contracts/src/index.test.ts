import { describe, expect, it } from "vitest";
import {
  API_VERSION,
  BANKING_CONTRACT_VERSION,
  type ApiEnvelope,
  type BankStatementImportRequest,
  type BankTransactionContract,
  type MutationMetadata,
} from "./index.js";

describe("AI-native API contracts", () => {
  it("keeps organization and request context in envelopes", () => {
    const response: ApiEnvelope<{ id: string }> = {
      apiVersion: API_VERSION,
      requestId: "req-1",
      organizationId: "org-naai",
      data: { id: "party-1" },
    };
    expect(response.apiVersion).toBe("v1");
  });

  it("returns audit and next-action mutation metadata", () => {
    const metadata: MutationMetadata = {
      resourceVersion: "3",
      auditEventId: "audit-1",
      correlationId: "corr-1",
      idempotencyReplayed: false,
      nextActions: ["submit"],
    };
    expect(metadata.nextActions).toEqual(["submit"]);
  });

  it("keeps bank CSV imports versioned and exact-money JSON safe", () => {
    const request: BankStatementImportRequest = {
      schemaVersion: BANKING_CONTRACT_VERSION,
      financialAccountId: "bank-1",
      adapterId: "generic-csv",
      adapterVersion: 1,
      filename: "statement.csv",
      csvText: "date,amount\n2026-08-05,-125000",
      columnMapping: { bookingDate: "date", amountMinor: "amount" },
    };
    const transaction: BankTransactionContract = {
      id: "txn-1",
      financialAccountId: "bank-1",
      sourceKey: "provider:tx-1",
      state: "imported",
      normalizationVersion: 1,
      adapterId: "generic-csv",
      adapterVersion: 1,
      bookingDate: "2026-08-05",
      amountMinor: "-125000",
      currency: "VND",
      rawPayloadHash: "a".repeat(64),
      resourceVersion: "1",
      nextActions: ["suggest", "ignore", "mark_needs_review"],
    };
    expect(request.schemaVersion).toBe(1);
    expect(transaction.amountMinor).toBe("-125000");
  });
});
