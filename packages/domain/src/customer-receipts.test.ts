import { describe, expect, it } from "vitest";
import { validateCustomerReceipt } from "./customer-receipts.js";

describe("customer receipt", () => {
  it("requires exact positive allocation", () => {
    expect(
      validateCustomerReceipt({
        amountMinor: "100",
        allocations: [{ salesInvoiceId: "i", amountMinor: "100" }],
      }).allocatedMinor,
    ).toBe(100n);
    expect(() =>
      validateCustomerReceipt({
        amountMinor: "100",
        allocations: [{ salesInvoiceId: "i", amountMinor: "99" }],
      }),
    ).toThrow("CUSTOMER_RECEIPT_ALLOCATION_MISMATCH");
  });
});
