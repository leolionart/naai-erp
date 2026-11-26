import { describe, expect, it, vi } from "vitest";
import { OwnerFundingService } from "./owner-funding.service.js";

const context = {
  organizationId: "org-983",
  actorId: "owner-1",
  roles: ["owner"],
  correlationId: "corr-983",
};

function makeFixture() {
  const store = {
    list: vi.fn().mockResolvedValue({
      items: [],
      summary: {
        ownerFundingMinor: "0",
        ownerRepaymentMinor: "0",
        netOwnerBankFundingMinor: "0",
      },
    }),
    get: vi.fn().mockResolvedValue({ id: "ofm-1", movementType: "owner_funding" }),
    record: vi.fn().mockResolvedValue({
      movementId: "ofm-1",
      movementType: "owner_funding",
      entryMode: "manual",
      status: "posted",
    }),
  };
  const master = { authenticate: vi.fn() };
  return { store, service: new OwnerFundingService(store as never, master as never) };
}

describe("ERP-983 OwnerFundingService", () => {
  it("defaults movementType to owner_funding and validates manual reference", async () => {
    const { service, store } = makeFixture();
    await expect(
      service.record(
        context,
        {
          financialAccountId: "bank-1",
          bookingDate: "2026-08-10",
          amountMinor: "10000000",
          description: "Chủ nạp tiền vào tài khoản công ty",
          reason: "Bổ sung vốn lưu động tạm thời",
        },
        "idem-missing-ref",
      ),
    ).rejects.toThrow("OWNER_FUNDING_REFERENCE_REQUIRED");

    const ok = await service.record(
      context,
      {
        financialAccountId: "bank-1",
        bookingDate: "2026-08-10",
        amountMinor: "10000000",
        reference: "UNC-20260810-01",
        description: "Chủ nạp tiền vào tài khoản công ty",
        reason: "Bổ sung vốn lưu động tạm thời",
      },
      "idem-ok",
    );
    expect(ok.data).toMatchObject({ movementId: "ofm-1", movementType: "owner_funding" });
    expect(store.record).toHaveBeenCalledWith(
      context,
      expect.objectContaining({ movementType: "owner_funding", reference: "UNC-20260810-01" }),
      "idem-ok",
    );
  });

  it("accepts bankTransactionId mode without manual fields and supports owner_repayment", async () => {
    const { service, store } = makeFixture();
    await service.record(
      context,
      {
        movementType: "owner_repayment",
        bankTransactionId: "bt-out-1",
        reason: "Hoàn trả tiền chủ đã ứng",
      },
      "idem-repay",
    );
    expect(store.record).toHaveBeenCalledWith(
      context,
      expect.objectContaining({
        movementType: "owner_repayment",
        bankTransactionId: "bt-out-1",
      }),
      "idem-repay",
    );
  });

  it("enforces RBAC, idempotency key, and filter validation", async () => {
    const { service } = makeFixture();
    await expect(
      service.record(
        { ...context, roles: ["viewer"] },
        { bankTransactionId: "bt-1", reason: "No role" },
        "idem-viewer",
      ),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      service.record(context, { bankTransactionId: "bt-1", reason: "No key" }),
    ).rejects.toThrow("IDEMPOTENCY_KEY_REQUIRED");
    await expect(service.list(context, { movementType: "invalid" })).rejects.toThrow(
      "VALIDATION_FAILED",
    );
  });
});
