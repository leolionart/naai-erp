import { renderToStaticMarkup } from "react-dom/server";
import type { InternalTransferContract, TransferLegContract } from "@naai-erp/contracts";
import { describe, expect, it } from "vitest";
import { internalTransferApi } from "@/lib/api";
import {
  filterInternalTransfers,
  internalTransferItems,
  InternalTransferListWorkspace,
} from "./internal-transfer-list-workspace";
import {
  internalTransferCandidates,
  InternalTransferWorkspace,
} from "./internal-transfer-workspace";

describe("ERP-420 internal transfer admin UI", () => {
  it("centralizes API paths and filters the list without financial recomputation", () => {
    expect(internalTransferApi.detail("transfer 1")).toBe(
      "banking/internal-transfers/transfer%201",
    );
    expect(internalTransferApi.candidates("bank out/1")).toBe(
      "banking/transactions/bank%20out%2F1/transfer-candidates",
    );
    const leg = (account: string): TransferLegContract => ({
      role: "source",
      transactionId: `tx-${account}`,
      financialAccountId: account,
      ledgerAccountId: `ledger-${account}`,
      statementAmountMinor: "100",
      principalAmountMinor: "100",
      baseAmountMinor: "100",
      currency: "VND",
      bookingDate: "2026-08-05",
    });
    const transfer = (
      id: string,
      state: InternalTransferContract["state"],
      account: string,
    ): InternalTransferContract => ({
      id,
      principalAmountMinor: "100",
      basePrincipalAmountMinor: "100",
      currency: "VND",
      state,
      currentAttemptNumber: 1,
      attempts: [
        {
          attemptNumber: 1,
          state,
          postingMode: "transit",
          transitAccountId: "transit",
          source: leg(account),
          journalIds: [],
          reversalJournalIds: [],
        },
      ],
      transitOutstandingMinor: "100",
      resourceVersion: "1",
      nextActions: [],
    });
    const rows = internalTransferItems({
      items: [
        transfer("t-1", "pending_counterpart", "bank-a"),
        transfer("t-2", "matched", "bank-b"),
      ],
    });
    expect(
      filterInternalTransfers(rows, {
        query: "t-1",
        state: "pending_counterpart",
        accountId: "bank-a",
      }),
    ).toEqual([expect.objectContaining({ id: "t-1" })]);
  });

  it("renders separate list and detail surfaces with contextual candidates", () => {
    const list = renderToStaticMarkup(<InternalTransferListWorkspace />);
    const detail = renderToStaticMarkup(<InternalTransferWorkspace transferId="transfer-1" />);
    expect(list).toContain("Transfer queue");
    expect(list).toContain("Bộ lọc");
    expect(detail).toContain("Chiều tiền ra");
    expect(detail).toContain("Chiều tiền vào");
    expect(detail).toContain("Journal readback và drill-down");
    expect(
      internalTransferCandidates({
        transactionId: "source-1",
        policyVersion: 1,
        thresholdBps: 8000,
        outcome: "unique",
        items: [
          {
            transactionId: "candidate-1",
            financialAccountId: "bank-b",
            bookingDate: "2026-08-05",
            currency: "VND",
            amountMinor: "100",
            eligible: true,
            confidenceBps: 9000,
            factors: {
              amountBps: 4000,
              dateBps: 1000,
              referenceBps: 1000,
              currencyBps: 1000,
              ownAccountBps: 2000,
            },
            reasons: [],
          },
        ],
      }),
    ).toEqual([expect.objectContaining({ transactionId: "candidate-1" })]);
  });
});
