import { describe, expect, it } from "vitest";
import {
  API_VERSION,
  AGING_CONTRACT_VERSION,
  BANKING_CONTROL_CONTRACT_VERSION,
  BANKING_CONTRACT_VERSION,
  INTERNAL_TRANSFER_CONTRACT_VERSION,
  RECONCILIATION_CONTRACT_VERSION,
  type ApiEnvelope,
  type BankStatementImportRequest,
  type BankTransactionContract,
  type MutationMetadata,
  type MatchReconciliationRequest,
  type CreateInternalTransferRequest,
  type InternalTransferContract,
  type PaymentReconciliationContract,
  type AgingReportContract,
  type BankStatementSessionContract,
  type CreateBankStatementSessionRequest,
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

  it("keeps reconciliation scores integer-bps and every money field an exact string", () => {
    const request: MatchReconciliationRequest = {
      schemaVersion: RECONCILIATION_CONTRACT_VERSION,
      baseAmountMinor: "60000000",
      allocations: [
        {
          targetType: "commercial_document",
          targetId: "sales-001",
          targetAmountMinor: "60000000",
          targetCurrency: "VND",
          baseAmountMinor: "60000000",
        },
      ],
      adjustments: [],
    };
    const reconciliation: PaymentReconciliationContract = {
      id: "rec-1",
      bankTransactionId: "bank-tx-1",
      direction: "receipt",
      statementAmountMinor: "60000000",
      statementCurrency: "VND",
      state: "matched",
      currentAttemptNumber: 1,
      attempts: [
        {
          attemptNumber: 1,
          state: "matched",
          policyVersion: 1,
          candidateGeneration: 2,
          bankBaseAmountMinor: "60000000",
          allocations: request.allocations,
          adjustments: [],
        },
      ],
      resourceVersion: "1",
      nextActions: ["reconcile"],
      drilldown: {
        bankTransactionId: "bank-tx-1",
        sourceDocumentIds: ["sales-001"],
        evidenceIds: [],
      },
    };
    expect(request.allocations[0]?.targetAmountMinor).toBe("60000000");
    expect(reconciliation.attempts[0]?.policyVersion).toBe(1);
  });

  it("keeps internal-transfer principal fee transit and control metadata machine-readable", () => {
    const request: CreateInternalTransferRequest = {
      schemaVersion: INTERNAL_TRANSFER_CONTRACT_VERSION,
      sourceTransactionId: "bank-out-101",
      destinationTransactionId: "bank-in-100",
      principalAmountMinor: "100000000",
      basePrincipalAmountMinor: "100000000",
      currency: "VND",
      transitAccountId: "1388-TRANSIT",
      fee: {
        mode: "embedded",
        amountMinor: "1000000",
        baseAmountMinor: "1000000",
        expenseAccountId: "642-BANK-FEE",
        reason: "Transfer fee",
      },
      reason: "Own-account transfer",
    };
    const transfer: InternalTransferContract = {
      id: "transfer-1",
      principalAmountMinor: request.principalAmountMinor,
      basePrincipalAmountMinor: request.basePrincipalAmountMinor,
      currency: "VND",
      state: "matched",
      currentAttemptNumber: 1,
      attempts: [
        {
          attemptNumber: 1,
          state: "matched",
          postingMode: "direct",
          transitAccountId: "1388-TRANSIT",
          fee: request.fee!,
          journalIds: [],
          reversalJournalIds: [],
        },
      ],
      transitOutstandingMinor: "0",
      resourceVersion: "1",
      nextActions: ["post", "unmatch"],
    };
    expect(transfer.attempts[0]?.fee?.amountMinor).toBe("1000000");
    expect(transfer.transitOutstandingMinor).toBe("0");
  });

  it("keeps aging as-of buckets drill-down and control ties exact and machine-readable", () => {
    const report: AgingReportContract = {
      schemaVersion: AGING_CONTRACT_VERSION,
      organizationId: "org-naai",
      side: "ar",
      asOf: "2026-08-31",
      timezone: "Asia/Ho_Chi_Minh",
      baseCurrency: "VND",
      source: "posted-ledger",
      filters: { includeSettled: false },
      bucketTotals: [
        { bucket: "1_30", amountMinor: "1000000", baseAmountMinor: "1000000", itemCount: 1 },
      ],
      creditOrAdvanceTotalMinor: "100000",
      baseCreditOrAdvanceTotalMinor: "100000",
      outstandingTotalMinor: "1000000",
      baseOutstandingTotalMinor: "900000",
      controlTies: [
        {
          controlAccountCode: "131",
          currency: "VND",
          status: "tied",
          subledgerBalanceMinor: "900000",
          ledgerBalanceMinor: "900000",
          differenceMinor: "0",
          subledgerBaseBalanceMinor: "900000",
          ledgerBaseBalanceMinor: "900000",
          baseDifferenceMinor: "0",
        },
      ],
      tieStatus: "tied",
      exceptions: [],
      items: [
        {
          id: "ar-invoice-1",
          side: "ar",
          balanceKind: "receivable",
          partyId: "client-1",
          partyName: "Client",
          controlAccountCode: "131",
          documentNumber: "INV-001",
          documentDate: "2026-07-01",
          dueDate: "2026-07-31",
          currency: "VND",
          bucket: "31_60",
          daysOverdue: 31,
          paymentStatus: "unpaid",
          originalMinor: "1000000",
          settledMinor: "0",
          outstandingMinor: "1000000",
          signedOutstandingMinor: "1000000",
          baseOutstandingMinor: "1000000",
          signedBaseOutstandingMinor: "1000000",
          drilldown: {
            sourceType: "commercial_document",
            sourceId: "invoice-1",
            journalIds: ["journal-1"],
            reconciliationIds: [],
            evidenceIds: ["evidence-1"],
            sourceHref: "/api/v1/organizations/org-naai/commercial-documents/invoice-1",
            journalHrefs: ["/api/v1/organizations/org-naai/journals/journal-1"],
            reconciliationHrefs: [],
            evidenceHrefs: ["/api/v1/organizations/org-naai/evidence/evidence-1"],
          },
        },
      ],
    };
    expect(report.schemaVersion).toBe(1);
    expect(report.items[0]?.outstandingMinor).toBe("1000000");
    expect(report.controlTies[0]?.differenceMinor).toBe("0");
  });

  it("keeps statement control totals dispositions suspense and closure blockers exact", () => {
    const request: CreateBankStatementSessionRequest = {
      schemaVersion: BANKING_CONTROL_CONTRACT_VERSION,
      financialAccountId: "bank-account-1",
      currency: "VND",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      openingBalanceMinor: "1000000",
      closingBalanceMinor: "1250000",
      importIds: ["import-1"],
      reason: "August statement",
    };
    const session: BankStatementSessionContract = {
      session: {
        id: "statement-1",
        financialAccountId: request.financialAccountId,
        currency: request.currency,
        periodStart: request.periodStart,
        periodEnd: request.periodEnd,
        openingBalanceMinor: request.openingBalanceMinor,
        closingBalanceMinor: request.closingBalanceMinor,
        importIds: request.importIds,
        state: "reviewed",
        resourceVersion: "2",
        nextActions: ["create-exception", "approve-exception", "resolve-exception"],
        events: [],
      },
      imports: [{ importId: "import-1", transactionCount: 1, acceptedTransactionCount: 1 }],
      transactions: [
        {
          id: "control-1",
          bankTransactionId: "bank-transaction-1",
          importId: "import-1",
          bookingDate: "2026-08-05",
          amountMinor: "250000",
          disposition: "accepted",
          controlStatus: "suspense",
        },
      ],
      exceptions: [
        {
          id: "exception-1",
          kind: "suspense",
          bankTransactionId: "bank-transaction-1",
          amountMinor: "250000",
          currency: "VND",
          reason: "Pending identification",
          ownerId: "finance-1",
          reviewDue: "2026-09-05",
          state: "pending",
          createdBy: "finance-1",
          createdAt: "2026-08-31T17:00:00+07:00",
        },
      ],
      control: {
        expectedMovementMinor: "250000",
        controlDifferenceMinor: "0",
        acceptedTransactionCount: 1,
        explainedTransactionCount: 1,
        pendingExceptionCount: 1,
        closeBlockers: ["unapproved_suspense:exception-1"],
        closable: false,
      },
    };
    expect(session.control.expectedMovementMinor).toBe("250000");
    expect(session.control.closeBlockers).toEqual(["unapproved_suspense:exception-1"]);
  });
});
