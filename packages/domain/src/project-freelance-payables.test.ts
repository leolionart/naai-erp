import { describe, expect, it } from "vitest";
import {
  validateFreelancePayable,
  validateFreelancePayment,
} from "./project-freelance-payables.js";
describe("project freelance payable", () => {
  it("requires exact positive actual cost and valid due date", () => {
    expect(
      validateFreelancePayable({
        expenseDate: "2026-08-11",
        dueDate: "2026-08-20",
        amountMinor: "100",
      }).amountMinor,
    ).toBe(100n);
    expect(() =>
      validateFreelancePayable({
        expenseDate: "2026-08-20",
        dueDate: "2026-08-11",
        amountMinor: "100",
      }),
    ).toThrow("FREELANCE_PAYABLE_DUE_DATE_INVALID");
  });
  it("does not allow payment above outstanding", () => {
    expect(validateFreelancePayment("40", 100n)).toBe(40n);
    expect(() => validateFreelancePayment("101", 100n)).toThrow(
      "FREELANCE_PAYMENT_OVER_ALLOCATION",
    );
  });
});
