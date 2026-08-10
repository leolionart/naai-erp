import { describe, expect, it } from "vitest";
import type {
  ConfirmedOwnerCurrentMovementContract,
  OwnerCurrentResponseContract,
  OwnerCurrentReviewItemContract,
} from "./banking.js";

describe("ERP-881 owner-current contracts", () => {
  it("keeps a confirmed cash timeline with its own historical running balance", () => {
    const repayment: ConfirmedOwnerCurrentMovementContract = {
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
      counterpartLines: [],
      sources: [],
    };
    const response: OwnerCurrentResponseContract = {
      summary: {
        ledgerClosingBalanceMinor: "8000000",
        confirmedClosingBalanceMinor: "7500000",
        confirmedIncreaseMinor: "10000000",
        confirmedDecreaseMinor: "2500000",
        ownerPaidCompanyCostMinor: "10000000",
        companyRepaymentToOwnerMinor: "2500000",
        ownerFundingMinor: "0",
        reviewAdjustmentMinor: "500000",
        reviewItemCount: 1,
      },
      confirmedTimeline: [repayment],
      reviewItems: [],
    };

    expect(response.confirmedTimeline[0]?.runningOwnerBalanceMinor).toBe("7500000");
    expect(response.summary.ledgerClosingBalanceMinor).toBe("8000000");
    expect(response.summary.confirmedClosingBalanceMinor).toBe("7500000");
  });

  it("separates unresolved adjustments from the confirmed running balance", () => {
    const review: OwnerCurrentReviewItemContract = {
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
      ownerAccountCodes: ["3388-OWNER"],
      counterpartLines: [],
      sources: [],
    };

    expect(review.needsReview).toBe(true);
    expect("runningOwnerBalanceMinor" in review).toBe(false);
  });
});
