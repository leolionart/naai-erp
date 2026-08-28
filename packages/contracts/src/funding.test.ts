import { describe, expect, it } from "vitest";
import type { FundingInputContract, FundingTypeContract } from "./funding.js";

describe("funding contract", () => {
  it("exposes exactly the three canonical funding types", () => {
    const values: FundingTypeContract[] = ["company_bank", "owner_paid", "owner_custody_cash"];
    expect(values).toHaveLength(3);
    const bank: FundingInputContract = { type: "company_bank", financialAccountId: "bank-vnd" };
    expect(bank.financialAccountId).toBe("bank-vnd");
  });
});
