import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReconciliationControlTotals } from "@/components/banking/reconciliation-components";
import {
  ReconciliationWorkspace,
  candidateItems,
  findTransactionReconciliation,
} from "./reconciliation-workspace";

describe("ERP-410 reconciliation workspace", () => {
  it("reads the canonical candidate list and transaction reconciliation envelopes", () => {
    expect(
      candidateItems({
        transactionId: "tx-1",
        items: [
          {
            id: "candidate-1",
            rank: 1,
            targetType: "commercial_document",
            targetId: "invoice-1",
            confidenceBps: 9200,
            factors: { amountBps: 3000, daysApart: 0 },
            status: "open",
            outstandingMinor: "100000",
            currency: "VND",
          },
        ],
      }),
    ).toEqual([expect.objectContaining({ id: "candidate-1", confidenceBps: 9200 })]);
    expect(
      findTransactionReconciliation(
        { items: [{ id: "rec-1", bankTransactionId: "tx-1" }] },
        "tx-1",
      ),
    ).toEqual(expect.objectContaining({ id: "rec-1" }));
  });

  it("renders an explainable workflow without inventing missing financial totals", () => {
    const workspace = renderToStaticMarkup(<ReconciliationWorkspace transactionId="tx-1" />);
    expect(workspace).toContain("Candidate và confidence");
    expect(workspace).toContain("Allocation, phí và FX");
    expect(workspace).toContain("Frontend không tự tính remaining");

    const totals = renderToStaticMarkup(<ReconciliationControlTotals detail={{}} />);
    expect(totals).toContain("Control totals từ API");
    expect(totals).not.toContain("0 ₫");
  });
});
