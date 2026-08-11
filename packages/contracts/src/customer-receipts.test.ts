import { describe, expect, it } from "vitest";
import { CUSTOMER_RECEIPT_CONTRACT_VERSION } from "./customer-receipts.js";
describe("customer receipt contract", () => {
  it("is v1", () => expect(CUSTOMER_RECEIPT_CONTRACT_VERSION).toBe(1));
});
