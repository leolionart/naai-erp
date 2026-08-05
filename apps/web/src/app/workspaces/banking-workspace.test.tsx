import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BankingWorkspace, bankingItems, filterBankTransactions } from "./banking-workspace";

describe("ERP-400 banking admin workspace", () => {
  it("unwraps API page envelopes and filters transactions by account, state and text", () => {
    const rows = bankingItems({
      items: [
        { id: "tx-1", bankAccountId: "bank-1", state: "imported", reference: "CLIENT A" },
        { id: "tx-2", bankAccountId: "bank-2", state: "needs_review", reference: "FEE" },
      ],
    });
    expect(rows).toHaveLength(2);
    expect(
      filterBankTransactions(rows, {
        accountId: "bank-2",
        state: "needs_review",
        query: "fee",
      }),
    ).toEqual([expect.objectContaining({ id: "tx-2" })]);
  });

  it("renders the operational account and imported transaction surfaces", () => {
    const html = renderToStaticMarkup(<BankingWorkspace />);
    expect(html).toContain("Tài khoản ngân hàng và tiền mặt");
    expect(html).toContain("Giao dịch đã import");
    expect(html).toContain("Import CSV");
    expect(html).not.toContain("Đối soát giao dịch");
  });
});
