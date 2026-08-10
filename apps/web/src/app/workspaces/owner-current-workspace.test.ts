import { describe, expect, it } from "vitest";
import { filterOwnerCurrentMovements } from "./owner-current-workspace";

const rows = [
  {
    journalId: "payment",
    date: "2026-01-01",
    description: "Rút tiền mặt sử dụng",
    currency: "VND",
    state: "posted",
    movementType: "company_repayment_to_owner" as const,
    ownerDeltaMinor: "-45000000",
    companyFundsDeltaMinor: "-45000000",
    runningOwnerBalanceMinor: "10000000",
    ownerAccountCodes: ["3388-OWNER"],
    needsReview: false,
    classificationBasis: "Owner Current giảm và tiền công ty giảm trong cùng bút toán",
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
    classificationBasis: "Chi phí ghi nhận nguồn tiền chủ chi hộ",
    sources: [],
  },
  {
    journalId: "adjustment",
    date: "2026-01-03",
    description: "Điều chỉnh chưa rõ nguồn",
    currency: "VND",
    state: "posted",
    movementType: "adjustment" as const,
    ownerDeltaMinor: "-1000000",
    companyFundsDeltaMinor: "0",
    runningOwnerBalanceMinor: "19000000",
    ownerAccountCodes: ["3388-OWNER"],
    needsReview: true,
    classificationBasis: "Không đủ đối ứng để phân loại",
    sources: [],
  },
];

describe("owner current movement filters", () => {
  it("isolates company payments to the owner and searches journal evidence", () => {
    expect(filterOwnerCurrentMovements(rows, "company_repayment_to_owner", "")).toEqual([rows[0]]);
    expect(filterOwnerCurrentMovements(rows, "all", "expense")).toEqual([rows[1]]);
    expect(filterOwnerCurrentMovements(rows, "adjustment", "review")).toEqual([rows[2]]);
  });
});
