import { describe, expect, it, vi } from "vitest";
import { requireActiveBankAccount } from "./owner-funding-queries.js";

function makeClient(row: Record<string, unknown> | undefined) {
  return {
    query: vi.fn(async () => ({ rows: row ? [row] : [] })),
  } as never;
}

describe("requireActiveBankAccount", () => {
  it("allows CASH-OWNER-CUSTODY when allowOwnerCustodyCash is true (owner_repayment)", async () => {
    const row = {
      id: "cash-owner-custody",
      code: "CASH-OWNER-CUSTODY",
      kind: "cash",
      status: "active",
      currency: "VND",
      ledger_account_code: "111-OWNER-CUSTODY",
    };
    await expect(
      requireActiveBankAccount(makeClient(row), "naai", "cash-owner-custody", {
        allowOwnerCustodyCash: true,
      }),
    ).resolves.toEqual(row);
  });

  it("rejects CASH-OWNER-CUSTODY when allowOwnerCustodyCash is false (owner_funding)", async () => {
    const row = {
      id: "cash-owner-custody",
      code: "CASH-OWNER-CUSTODY",
      kind: "cash",
      status: "active",
      currency: "VND",
      ledger_account_code: "111-OWNER-CUSTODY",
    };
    await expect(
      requireActiveBankAccount(makeClient(row), "naai", "cash-owner-custody"),
    ).rejects.toThrow("OWNER_FUNDING_BANK_ACCOUNT_REQUIRED");
  });

  it("rejects non-custody cash accounts even when allowOwnerCustodyCash is true", async () => {
    const row = {
      id: "cash-company",
      code: "CASH-COMPANY",
      kind: "cash",
      status: "active",
      currency: "VND",
      ledger_account_code: "111-CASH",
    };
    await expect(
      requireActiveBankAccount(makeClient(row), "naai", "cash-company", {
        allowOwnerCustodyCash: true,
      }),
    ).rejects.toThrow("OWNER_FUNDING_BANK_ACCOUNT_REQUIRED");
  });
});
