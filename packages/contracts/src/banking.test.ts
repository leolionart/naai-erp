import { describe, expect, it } from "vitest";
import type { OwnerCurrentMovementContract, OwnerCurrentResponseContract } from "./banking.js";

describe("ERP-876 owner-current contracts", () => {
  it("keeps repayment and owner-paid costs distinct with exact minor-unit strings", () => {
    const repayment: OwnerCurrentMovementContract = {
      journalId: "journal-repayment-1",
      date: "2026-08-09",
      description: "Company repays owner",
      currency: "VND",
      state: "posted",
      reversalOfId: null,
      movementType: "company_repayment_to_owner",
      classificationBasis: "company_funds_repayment_to_owner",
      needsReview: false,
      ownerDeltaMinor: "-2500000",
      companyFundsDeltaMinor: "-2500000",
      runningOwnerBalanceMinor: "7500000",
      ownerAccountCodes: ["3388-OWNER"],
      counterpartLines: [
        {
          accountCode: "1121",
          accountName: "Company bank",
          debitMinor: "0",
          creditMinor: "2500000",
          description: "Repayment",
        },
      ],
      sources: [],
    };
    const response: OwnerCurrentResponseContract = {
      summary: {
        increaseMinor: "10000000",
        decreaseMinor: "2500000",
        closingBalanceMinor: "7500000",
        ownerPaidCompanyCostMinor: "10000000",
        companyRepaymentToOwnerMinor: "2500000",
        ownerFundingMinor: "0",
        adjustmentMinor: "0",
        needsReviewCount: 0,
      },
      items: [repayment],
    };

    expect(response.items[0]?.movementType).toBe("company_repayment_to_owner");
    expect(response.summary.companyRepaymentToOwnerMinor).toBe("2500000");
  });

  it("makes unresolved classification explicit instead of guessing a source", () => {
    const movement: OwnerCurrentMovementContract = {
      journalId: "journal-review-1",
      date: "2026-08-09",
      description: "Unresolved owner-current movement",
      currency: "VND",
      state: "posted",
      reversalOfId: null,
      movementType: "adjustment",
      classificationBasis: "unresolved_owner_current_movement",
      needsReview: true,
      ownerDeltaMinor: "500000",
      companyFundsDeltaMinor: "0",
      runningOwnerBalanceMinor: "500000",
      ownerAccountCodes: ["3388-OWNER"],
      counterpartLines: [],
      sources: [],
    };

    expect(movement.needsReview).toBe(true);
    expect(movement.classificationBasis).toBe("unresolved_owner_current_movement");
  });
});
