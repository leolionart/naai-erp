import { describe, expect, it } from "vitest";
import { presentExpenseRecord } from "./focused-expense-presentation";

describe("expense presentation", () => {
  it("maps the snake_case shape returned by the live expense list", () => {
    expect(
      presentExpenseRecord({
        expense_date: "2026-07-29",
        business_purpose: "Imported company expense",
        gross_minor: "408601",
        payee_party_id: "party-supplier",
        category: "TELECOM",
        counter_account_code: "331",
      }),
    ).toEqual({
      activityDate: "2026-07-29",
      description: "Imported company expense",
      amountMinor: "408601",
      payeePartyId: "party-supplier",
      category: "TELECOM",
      counterAccountCode: "331",
    });
  });

  it("uses the canonical line description when the expense header has no useful note", () => {
    expect(
      presentExpenseRecord({
        expense_date: "2024-10-03",
        gross_minor: "3000000",
        lines: [{ description: "Máy in Brother L2321" }],
      }).description,
    ).toBe("Máy in Brother L2321");
  });

  it("falls back to the canonical line category when the list root projection is absent", () => {
    expect(
      presentExpenseRecord({
        expense_date: "2026-08-04",
        gross_minor: "120000",
        lines: [{ expense_category_code: "SOFTWARE" }],
      }).category,
    ).toBe("SOFTWARE");
  });
});
