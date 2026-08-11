import { describe, expect, it } from "vitest";
import type {
  ConfirmedOwnerSettlementMovementContract,
  CreateOwnerCashWithdrawalRequest,
  OwnerSettlementPositionContract,
  OwnerSettlementReviewItemContract,
} from "./banking.js";

const ownerWithdrawalRequest: CreateOwnerCashWithdrawalRequest = {
  schemaVersion: 1,
  movementType: "owner_personal_withdrawal",
  financialAccountId: "bank-main",
  bookingDate: "2026-08-11",
  amountMinor: "5000000",
  currency: "VND",
  description: "Chủ rút tiền dùng cá nhân",
  reason: "Ghi nhận theo giao dịch thực tế",
};

describe("ERP-883 owner settlement contracts", () => {
  it("keeps owner withdrawal input free of ledger account codes", () => {
    expect(ownerWithdrawalRequest.amountMinor).toBe("5000000");
    expect(ownerWithdrawalRequest).not.toHaveProperty("ownerAccountCode");
    expect(ownerWithdrawalRequest).not.toHaveProperty("journalLines");
  });
  it("separates statutory Owner Current from the confirmed settlement position", () => {
    const withdrawal: ConfirmedOwnerSettlementMovementContract = {
      journalId: "journal-owner-withdrawal-1",
      date: "2026-08-09",
      description: "Owner withdrew company cash",
      currency: "VND",
      state: "posted",
      reversalOfId: null,
      movementType: "owner_personal_withdrawal",
      classificationBasis: "company_funds_withdrawn_by_owner",
      needsReview: false,
      ownerDeltaMinor: "-2500000",
      companyFundsDeltaMinor: "-2500000",
      settlementDeltaMinor: "-2500000",
      runningConfirmedSettlementBalanceMinor: "7500000",
      ownerAccountCodes: ["3388-OWNER"],
      counterpartLines: [],
      sources: [],
    };
    const position: OwnerSettlementPositionContract = {
      summary: {
        statutoryOwnerCurrentBalanceMinor: "8000000",
        confirmedSettlementBalanceMinor: "7500000",
        companyOwesOwnerMinor: "7500000",
        ownerHoldsCompanyFundsMinor: "0",
        ownerPaidCompanyCostMinor: "10000000",
        ownerCustodyCashMinor: "0",
        ownerPersonalWithdrawalMinor: "2500000",
        ownerFundingMinor: "0",
        reviewMinor: "500000",
        reviewCount: 1,
      },
      confirmedTimeline: [withdrawal],
      reviewItems: [],
    };

    expect(position.summary.companyOwesOwnerMinor).toBe("7500000");
    expect(position.summary.statutoryOwnerCurrentBalanceMinor).toBe("8000000");
  });

  it("keeps unsupported generic repayment outside the confirmed timeline", () => {
    const review: OwnerSettlementReviewItemContract = {
      journalId: "journal-legacy-repayment-1",
      date: "2026-08-09",
      description: "Legacy repayment without typed withdrawal evidence",
      currency: "VND",
      state: "posted",
      reversalOfId: null,
      proposedMovementType: "company_repayment_to_owner",
      reviewReason: "unsupported_company_repayment",
      needsReview: true,
      ownerDeltaMinor: "-500000",
      companyFundsDeltaMinor: "-500000",
      ownerAccountCodes: ["3388-OWNER"],
      counterpartLines: [],
      sources: [],
    };

    expect(review.needsReview).toBe(true);
    expect("runningConfirmedSettlementBalanceMinor" in review).toBe(false);
  });

  it("exposes owner-held company funds without a negative company payable", () => {
    const position: OwnerSettlementPositionContract = {
      summary: {
        statutoryOwnerCurrentBalanceMinor: "-3000000",
        confirmedSettlementBalanceMinor: "-3000000",
        companyOwesOwnerMinor: "0",
        ownerHoldsCompanyFundsMinor: "3000000",
        ownerPaidCompanyCostMinor: "2000000",
        ownerCustodyCashMinor: "5000000",
        ownerPersonalWithdrawalMinor: "0",
        ownerFundingMinor: "0",
        reviewMinor: "0",
        reviewCount: 0,
      },
      confirmedTimeline: [],
      reviewItems: [],
    };

    expect(position.summary.companyOwesOwnerMinor).toBe("0");
    expect(position.summary.ownerHoldsCompanyFundsMinor).toBe("3000000");
  });
});
