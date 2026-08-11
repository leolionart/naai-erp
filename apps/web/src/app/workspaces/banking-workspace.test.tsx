import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  BankingWorkspace,
  bankingItems,
  cashMovementDirection,
  combinedMoneyAccountRows,
  financialAccountLabel,
  filterBankTransactions,
  filterCashFundTransactions,
  moneyLedgerAccounts,
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

  it("shows readable legacy account names and maps canonical money-ledger balances", () => {
    expect(
      financialAccountLabel({
        id: "bank-erp851-inferred-source",
        display_name: "Tài khoản ngân hàng nguồn ERP-851 (suy luận)",
        bank_code: "SOURCE",
        masked_identifier: "Nguồn chưa đủ số tài khoản",
      }),
    ).toEqual({
      displayName: "Tài khoản ngân hàng công ty",
      bankLabel: "Ngân hàng chưa cập nhật",
      identifierLabel: "Chưa cập nhật số tài khoản",
    });

    expect(
      moneyLedgerAccounts(
        [
          { code: "111-CASH", name: "Tiền mặt" },
          { code: "112-BANK", name: "Tiền gửi ngân hàng" },
          { code: "113-TRANSIT", name: "Tiền đang chuyển" },
          { code: "131-AR", name: "Phải thu" },
        ],
        [
          { accountCode: "111-CASH", closingNetMinor: "135320000", lineCount: "4" },
          { accountCode: "112-BANK", closingNetMinor: "-56986340", lineCount: "60" },
        ],
        [
          { id: "cash-main", ledgerAccountCode: "111-CASH" },
          { id: "bank-main", ledgerAccountCode: "112-BANK" },
        ],
      ),
    ).toEqual([
      {
        code: "111-CASH",
        name: "Tiền mặt",
        closingNetMinor: "135320000",
        lineCount: "4",
        mappedAccountCount: 1,
      },
      {
        code: "112-BANK",
        name: "Tiền gửi ngân hàng",
        closingNetMinor: "-56986340",
        lineCount: "60",
        mappedAccountCount: 1,
      },
      {
        code: "113-TRANSIT",
        name: "Tiền đang chuyển",
        closingNetMinor: "0",
        lineCount: "0",
        mappedAccountCount: 0,
      },
    ]);
  });

  it("merges an unmapped transit ledger account into the main money-account table", () => {
    expect(
      combinedMoneyAccountRows(
        [
          { id: "cash-main", ledgerAccountCode: "111-CASH" },
          { id: "bank-main", ledgerAccountCode: "112-BANK" },
        ],
        [
          {
            code: "111-CASH",
            name: "Tiền mặt",
            closingNetMinor: "100",
            lineCount: "1",
            mappedAccountCount: 1,
          },
          {
            code: "112-BANK",
            name: "Tiền gửi ngân hàng",
            closingNetMinor: "200",
            lineCount: "2",
            mappedAccountCount: 1,
          },
          {
            code: "113-TRANSIT",
            name: "Tiền đang chuyển",
            closingNetMinor: "0",
            lineCount: "0",
            mappedAccountCount: 0,
          },
        ],
      ),
    ).toEqual([
      { id: "cash-main", ledgerAccountCode: "111-CASH" },
      { id: "bank-main", ledgerAccountCode: "112-BANK" },
      {
        id: "ledger:113-TRANSIT",
        displayName: "Tiền đang chuyển",
        kind: "transit",
        currency: "VND",
        ledgerAccountCode: "113-TRANSIT",
        status: "system",
      },
    ]);
  });

  it("renders the operational account and imported transaction surfaces", () => {
    const html = renderToStaticMarkup(<BankingWorkspace />);
    expect(html).not.toContain("Điều hướng nghiệp vụ ngân hàng");
    expect(html).not.toContain("Chuyển tiền nội bộ");
    expect(html).not.toContain("Kiểm soát sao kê");
    expect(html).toContain("Tài khoản ngân hàng và tiền mặt");
    expect(html).not.toContain("Đối chiếu tài khoản tiền trong sổ cái");
    expect(html).toContain("Lịch sử nộp/rút quỹ tiền mặt");
    expect(html).toContain("Quỹ tiền mặt");
    expect(html).toContain("Loại biến động");
    expect(html).toContain("đã đối soát hoặc đã bỏ qua");
    expect(html).toContain("Hàng chờ đối soát");
    expect(html).toContain("Import CSV");
    expect(html).not.toContain("Đối soát giao dịch");
  });
});
