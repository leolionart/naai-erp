import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  BankingWorkspace,
  bankingItems,
  cashMovementDirection,
  filterBankTransactions,
  filterCashFundTransactions,
} from "./banking-workspace";

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

  it("keeps every cash-fund lifecycle state in history and filters deposits or withdrawals", () => {
    const accounts = [
      { id: "cash-main", kind: "cash", displayName: "Quỹ chính" },
      { id: "bank-main", kind: "bank", displayName: "Ngân hàng" },
    ];
    const rows = [
      { id: "cash-in", financialAccountId: "cash-main", amountMinor: "500", state: "imported" },
      {
        id: "cash-out",
        financialAccountId: "cash-main",
        amountMinor: "-200",
        state: "reconciled",
      },
      {
        id: "cash-ignored",
        financialAccountId: "cash-main",
        outflowMinor: "50",
        state: "ignored",
      },
      { id: "bank-in", financialAccountId: "bank-main", amountMinor: "900", state: "matched" },
    ];

    expect(filterCashFundTransactions(rows, accounts, { accountId: "", direction: "" })).toEqual([
      expect.objectContaining({ id: "cash-in", state: "imported" }),
      expect.objectContaining({ id: "cash-out", state: "reconciled" }),
      expect.objectContaining({ id: "cash-ignored", state: "ignored" }),
    ]);
    expect(
      filterCashFundTransactions(rows, accounts, {
        accountId: "cash-main",
        direction: "withdrawal",
      }).map((row) => row.id),
    ).toEqual(["cash-out", "cash-ignored"]);
    expect(cashMovementDirection(rows[0]!)).toBe("deposit");
    expect(cashMovementDirection(rows[1]!)).toBe("withdrawal");
  });

  it("renders the operational account and imported transaction surfaces", () => {
    const html = renderToStaticMarkup(<BankingWorkspace />);
    expect(html).not.toContain("Điều hướng nghiệp vụ ngân hàng");
    expect(html).not.toContain("Chuyển tiền nội bộ");
    expect(html).not.toContain("Kiểm soát sao kê");
    expect(html).toContain("Tài khoản ngân hàng và tiền mặt");
    expect(html).toContain("Lịch sử nộp/rút quỹ tiền mặt");
    expect(html).toContain("Quỹ tiền mặt");
    expect(html).toContain("Loại biến động");
    expect(html).toContain("đã đối soát hoặc đã bỏ qua");
    expect(html).toContain("Hàng chờ đối soát");
    expect(html).toContain("Import CSV");
    expect(html).not.toContain("Đối soát giao dịch");
  });
});
