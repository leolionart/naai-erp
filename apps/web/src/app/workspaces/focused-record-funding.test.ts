import { describe, expect, it } from "vitest";
import {
  findFundingOption,
  fundingOptionValue,
  fundingTarget,
  isCurrentFunding,
  type FundingOption,
} from "./focused-record-shared";

const options: readonly FundingOption[] = [
  { code: "111-CASH", label: "Quỹ tiền mặt công ty (111-CASH)", financialAccountId: "fa-company" },
  {
    code: "111-CASH",
    label: "Tiền công ty chủ giữ hộ (111-CASH)",
    financialAccountId: "fa-custody",
  },
  { code: "3388-OWNER", label: "Chủ doanh nghiệp chi hộ (TK 3388)" },
];

describe("funding options", () => {
  it("tells accounts that share a ledger code apart by id", () => {
    expect(options.map(fundingOptionValue)).toEqual([
      "account:fa-company",
      "account:fa-custody",
      "3388-OWNER",
    ]);
    expect(findFundingOption("account:fa-custody", options)?.label).toContain("chủ giữ hộ");
  });

  it("sends the financial account id for accounts and the ledger code otherwise", () => {
    expect(fundingTarget("account:fa-custody", options)).toEqual({
      financialAccountId: "fa-custody",
    });
    expect(fundingTarget("3388-OWNER", options)).toEqual({ counterAccountCode: "3388-OWNER" });
  });

  it("hides only the current source, so custody cash stays selectable from company cash", () => {
    const row = { fundingFinancialAccountId: "fa-company", counterAccountCode: "111-CASH" };
    expect(options.map((option) => isCurrentFunding(option, row))).toEqual([true, false, false]);
    const legacy = { counterAccountCode: "3388-OWNER" };
    expect(options.map((option) => isCurrentFunding(option, legacy))).toEqual([false, false, true]);
  });
});
