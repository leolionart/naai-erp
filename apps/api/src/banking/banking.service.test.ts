import { describe, expect, it, vi } from "vitest";
import { BankingService } from "./banking.service.js";
import { classifyOwnerCurrentMovement } from "./pg-banking.store.js";

const context = {
  organizationId: "org-bank",
  actorId: "finance-user",
  roles: ["finance_admin"],
  correlationId: "corr-bank",
};

function fixture() {
  const store = {
    listAccounts: vi.fn().mockResolvedValue({ items: [] }),
    getAccount: vi.fn().mockResolvedValue({ id: "bank-1" }),
    createAccount: vi.fn().mockResolvedValue({ accountId: "bank-1" }),
    deactivateAccount: vi.fn().mockResolvedValue({ accountId: "bank-1", status: "inactive" }),
    importStatement: vi.fn().mockResolvedValue({ importId: "import-1" }),
    dryRunImport: vi.fn().mockResolvedValue({ valid: true, mutationCount: 0 }),
    listImports: vi.fn().mockResolvedValue({ items: [] }),
    getImport: vi.fn().mockResolvedValue({ id: "import-1" }),
    listTransactions: vi.fn().mockResolvedValue({ items: [] }),
    listOwnerCurrentMovements: vi.fn().mockResolvedValue({ summary: {}, items: [] }),
    getTransaction: vi.fn().mockResolvedValue({ id: "txn-1" }),
    transitionTransaction: vi.fn().mockResolvedValue({ transactionId: "txn-1", state: "ignored" }),
  };
  const master = { authenticate: vi.fn() };
  return { store, subject: new BankingService(store, master as never) };
}

const account = {
  code: "VCB-VND-01",
  kind: "bank" as const,
  displayName: "VCB operating",
  currency: "VND",
  ledgerAccountCode: "1121",
  bankCode: "VCB",
};
const importInput = {
  financialAccountId: "bank-1",
  adapterId: "generic-csv" as const,
  adapterVersion: 1 as const,
  filename: "statement.csv",
  csvText: "booking_date,amount_minor,currency,description\n2026-08-05,100,VND,Receipt",
};

describe("ERP-400 banking service", () => {
  it("enforces privileged account mutation and idempotency", async () => {
    const { subject, store } = fixture();
    await subject.createAccount(context, account, "account-key");
    expect(store.createAccount).toHaveBeenCalledWith(context, account, "account-key");
    await expect(
      subject.createAccount({ ...context, roles: ["viewer"] }, account, "key"),
    ).rejects.toThrow("FORBIDDEN");
    await expect(subject.createAccount(context, account)).rejects.toThrow(
      "IDEMPOTENCY_KEY_REQUIRED",
    );
  });

  it("allows integration identities to dry-run and import but not manage accounts", async () => {
    const { subject, store } = fixture();
    const integration = { ...context, roles: ["integration"] };
    const dryRun = await subject.dryRunImport(integration, importInput);
    expect(dryRun.data).toMatchObject({ valid: true, mutationCount: 0 });
    await subject.importStatement(integration, importInput, "import-key");
    expect(store.importStatement).toHaveBeenCalled();
    await expect(subject.createAccount(integration, account, "key")).rejects.toThrow("FORBIDDEN");
  });

  it("only exposes ERP-400 branch transitions with a reason", async () => {
    const { subject, store } = fixture();
    await subject.transitionTransaction(
      context,
      "txn-1",
      "ignore",
      { reason: "Duplicate cash movement" },
      "transition-key",
    );
    expect(store.transitionTransaction).toHaveBeenCalledWith(
      context,
      "txn-1",
      "ignore",
      "Duplicate cash movement",
      "transition-key",
    );
    await expect(
      subject.transitionTransaction(context, "txn-1", "reconcile", { reason: "Later task" }, "key"),
    ).rejects.toThrow("INVALID_BANK_TRANSACTION_TRANSITION");
    await expect(
      subject.transitionTransaction(context, "txn-1", "ignore", { reason: " " }, "key"),
    ).rejects.toThrow("VALIDATION_FAILED");
  });

  it("preserves canonical expense traceability in owner-current read models", async () => {
    const { subject, store } = fixture();
    store.listOwnerCurrentMovements.mockResolvedValue({
      summary: { closingBalanceMinor: "1200000" },
      items: [
        {
          journalId: "journal-expense-1",
          ownerDeltaMinor: "1200000",
          sources: [
            {
              sourceType: "expense",
              sourceId: "expense-1",
              title: "Gia hạn tên miền",
              category: "DOMAIN",
              citState: "eligible",
              vatState: "eligible",
            },
          ],
        },
      ],
    });

    const result = await subject.listOwnerCurrentMovements(context);

    expect(result.data).toMatchObject({
      summary: { closingBalanceMinor: "1200000" },
      items: [
        {
          sources: [
            {
              sourceId: "expense-1",
              title: "Gia hạn tên miền",
              category: "DOMAIN",
            },
          ],
        },
      ],
    });
  });
});

describe("ERP-876 owner-current classification", () => {
  it("requires canonical source evidence before calling a credit owner-paid company cost", () => {
    expect(
      classifyOwnerCurrentMovement({
        ownerDelta: 1_000n,
        companyFundsDelta: 0n,
        sources: [],
      }),
    ).toMatchObject({
      movementType: "adjustment",
      classificationBasis: "unresolved_owner_current_movement",
      needsReview: true,
    });
    expect(
      classifyOwnerCurrentMovement({
        ownerDelta: 1_000n,
        companyFundsDelta: 0n,
        sources: [{ sourceType: "expense", fundingTreatments: ["company_funds"] }],
      }),
    ).toMatchObject({ movementType: "adjustment", needsReview: true });
    expect(
      classifyOwnerCurrentMovement({
        ownerDelta: 1_000n,
        companyFundsDelta: 0n,
        sources: [{ sourceType: "expense", fundingTreatments: ["owner_paid_company_cost"] }],
      }),
    ).toMatchObject({
      movementType: "owner_paid_company_cost",
      classificationBasis: "canonical_owner_paid_source",
      needsReview: false,
    });
    expect(
      classifyOwnerCurrentMovement({
        ownerDelta: 1_000n,
        companyFundsDelta: 0n,
        sources: [{ sourceType: "purchase_invoice", fundingTreatments: [] }],
      }),
    ).toMatchObject({ movementType: "adjustment", needsReview: true });
  });

  it("distinguishes company repayment and owner funding using both journal legs", () => {
    expect(
      classifyOwnerCurrentMovement({
        ownerDelta: -700n,
        companyFundsDelta: -700n,
        sources: [],
      }),
    ).toMatchObject({
      movementType: "company_repayment_to_owner",
      classificationBasis: "company_funds_repayment_to_owner",
      needsReview: false,
    });
    expect(
      classifyOwnerCurrentMovement({
        ownerDelta: 900n,
        companyFundsDelta: 900n,
        sources: [],
      }),
    ).toMatchObject({
      movementType: "owner_funding",
      classificationBasis: "owner_funding_to_company_funds",
      needsReview: false,
    });
    expect(
      classifyOwnerCurrentMovement({
        ownerDelta: -700n,
        companyFundsDelta: 0n,
        sources: [{ sourceType: "expense", fundingTreatments: ["owner_paid_company_cost"] }],
      }),
    ).toMatchObject({ movementType: "adjustment", needsReview: true });
  });

  it("classifies reversals from the original direction so confirmed balances negate", () => {
    expect(
      classifyOwnerCurrentMovement({
        ownerDelta: -1_000n,
        companyFundsDelta: 0n,
        reversalOfId: "owner-paid-original",
        sources: [{ sourceType: "expense", fundingTreatments: ["owner_paid_company_cost"] }],
      }),
    ).toMatchObject({ movementType: "owner_paid_company_cost", needsReview: false });
    expect(
      classifyOwnerCurrentMovement({
        ownerDelta: 700n,
        companyFundsDelta: 700n,
        reversalOfId: "repayment-original",
        sources: [],
      }),
    ).toMatchObject({ movementType: "company_repayment_to_owner", needsReview: false });
  });
});
