import { describe, expect, it, vi } from "vitest";
import { InternalTransferService } from "./internal-transfer.service.js";
const c = {
  organizationId: "org",
  actorId: "finance",
  roles: ["finance_admin"],
  correlationId: "corr",
};
const fixture = () => {
  const store = {
    list: vi.fn().mockResolvedValue({ items: [] }),
    get: vi.fn(),
    transactionCandidates: vi.fn().mockResolvedValue({ items: [] }),
    create: vi.fn().mockResolvedValue({}),
    match: vi.fn().mockResolvedValue({}),
    unmatch: vi.fn().mockResolvedValue({}),
  };
  return { store, subject: new InternalTransferService(store, { authenticate: vi.fn() } as never) };
};
describe("ERP-420 internal transfer service", () => {
  it("requires scoped authority idempotency and exact contract", async () => {
    const { subject, store } = fixture();
    const input = {
      schemaVersion: 1 as const,
      sourceTransactionId: "out",
      principalAmountMinor: "100",
      basePrincipalAmountMinor: "100",
      currency: "VND",
      transitAccountId: "113",
      reason: "Own transfer",
    };
    await subject.create(c, input, "key");
    expect(store.create).toHaveBeenCalledWith(c, input, "key");
    await expect(subject.create({ ...c, roles: ["viewer"] }, input, "key")).rejects.toThrow(
      "FORBIDDEN",
    );
    await expect(subject.create(c, input)).rejects.toThrow("IDEMPOTENCY_KEY_REQUIRED");
  });
  it("accepts declared embedded or separate fees but never an undeclared mismatch", async () => {
    const { subject } = fixture();
    await subject.create(
      c,
      {
        schemaVersion: 1,
        sourceTransactionId: "out",
        principalAmountMinor: "100",
        basePrincipalAmountMinor: "100",
        currency: "VND",
        transitAccountId: "113",
        reason: "Transfer",
        fee: {
          mode: "embedded",
          amountMinor: "1",
          baseAmountMinor: "1",
          expenseAccountId: "642",
          reason: "Fee",
        },
      },
      "fee",
    );
    await expect(
      subject.create(
        c,
        {
          schemaVersion: 1,
          sourceTransactionId: "out",
          principalAmountMinor: "100",
          basePrincipalAmountMinor: "100",
          currency: "VND",
          transitAccountId: "113",
          reason: "Transfer",
          fee: {
            mode: "separate_transaction",
            amountMinor: "1",
            baseAmountMinor: "1",
            expenseAccountId: "642",
            reason: "Fee",
          },
        },
        "bad",
      ),
    ).rejects.toThrow("VALIDATION_FAILED");
  });
});
