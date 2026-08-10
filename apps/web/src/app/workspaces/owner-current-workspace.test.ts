import { describe, expect, it } from "vitest";
import { filterOwnerCurrentMovements } from "./owner-current-workspace";

const rows = [
  {
    journalId: "payment",
    date: "2026-01-01",
    description: "Rút tiền mặt sử dụng",
    currency: "VND",
    state: "posted",
    movementType: "owner_personal_withdrawal" as const,
    ownerDeltaMinor: "-45000000",
    companyFundsDeltaMinor: "-45000000",
    runningOwnerBalanceMinor: "10000000",
    ownerAccountCodes: ["3388-OWNER"],
    needsReview: false,
    classificationBasis: "company_funds_withdrawn_by_owner",
    settlementDeltaMinor: "-45000000",
    runningConfirmedSettlementBalanceMinor: "10000000",
    sources: [],
  },
  {
    journalId: "expense",
    date: "2026-01-02",
    description: "Chủ thanh toán chi phí công ty",
    currency: "VND",
    state: "posted",
    movementType: "owner_paid_company_cost" as const,
    ownerDeltaMinor: "10000000",
    companyFundsDeltaMinor: "0",
    runningOwnerBalanceMinor: "20000000",
    ownerAccountCodes: ["3388-OWNER"],
    needsReview: false,
    classificationBasis: "canonical_owner_paid_expense",
    settlementDeltaMinor: "10000000",
    runningConfirmedSettlementBalanceMinor: "20000000",
    sources: [],
  },
  {
    journalId: "adjustment",
    date: "2026-01-03",
    description: "Điều chỉnh chưa rõ nguồn",
    currency: "VND",
    state: "posted",
    proposedMovementType: "company_repayment_to_owner" as const,
    ownerDeltaMinor: "-1000000",
    companyFundsDeltaMinor: "0",
    runningOwnerBalanceMinor: "19000000",
    ownerAccountCodes: ["3388-OWNER"],
    needsReview: true,
    reviewReason: "unsupported_company_repayment",
    sources: [],
  },
];

describe("owner current movement filters", () => {
  it("isolates company payments to the owner and searches journal evidence", () => {
    expect(filterOwnerCurrentMovements(rows, "owner_personal_withdrawal", "")).toEqual([rows[0]]);
    expect(filterOwnerCurrentMovements(rows, "all", "expense")).toEqual([rows[1]]);
    expect(filterOwnerCurrentMovements(rows, "all", "unsupported")).toEqual([rows[2]]);
  });
});
