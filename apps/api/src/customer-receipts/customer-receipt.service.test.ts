import { describe, expect, it, vi } from "vitest";
import { CustomerReceiptService } from "./customer-receipt.service.js";

const context = {
  organizationId: "org",
  actorId: "owner",
  roles: ["owner"],
  correlationId: "corr",
};
const input = {
  schemaVersion: 1 as const,
  financialAccountId: "bank",
  receiptDate: "2026-08-11",
  amountMinor: "100",
  currency: "VND",
  description: "Thu tiền",
  reason: "Khách thanh toán",
  allocations: [{ salesInvoiceId: "invoice", amountMinor: "100" }],
};

describe("CustomerReceiptService", () => {
  it("requires exact allocations and delegates one canonical mutation", async () => {
    const store = {
      create: vi.fn().mockResolvedValue({ id: "receipt" }),
      list: vi.fn(),
      get: vi.fn(),
    };
    const service = new CustomerReceiptService(store, {} as never);
    await expect(service.create(context, input, "key")).resolves.toMatchObject({
      data: { id: "receipt" },
    });
    expect(store.create).toHaveBeenCalledOnce();
    await expect(
      service.create(
        context,
        { ...input, allocations: [{ salesInvoiceId: "invoice", amountMinor: "99" }] },
        "key-2",
      ),
    ).rejects.toThrow("CUSTOMER_RECEIPT_ALLOCATION_MISMATCH");
  });
});
