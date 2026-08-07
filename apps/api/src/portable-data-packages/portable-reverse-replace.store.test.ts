import { describe, expect, it, vi } from "vitest";
import { PgCommercialDocumentStore } from "../commercial-documents/pg-commercial-document.store.js";
import { PgExpenseStore } from "../expenses/pg-expense.store.js";

const context = {
  organizationId: "org-a",
  actorId: "finance-a",
  roles: ["finance_admin"],
  correlationId: "corr-a",
} as const;
const document = {
  id: "replacement-doc",
  type: "sales_invoice" as const,
  documentNumber: "SI-REPLACEMENT",
  fiscalYear: 2026,
  partyId: "client-a",
  documentDate: "2026-08-08",
  dueDate: "2026-09-08",
  currency: "VND",
  netMinor: "100",
  taxMinor: "10",
  grossMinor: "110",
  controlAccountCode: "131",
  lines: [
    {
      description: "Replacement",
      quantity: "1",
      unitPriceMinor: "100",
      netMinor: "100",
      taxMinor: "10",
      grossMinor: "110",
      primaryAccountCode: "511",
      taxAccountCode: "3331",
      allocations: [{ id: "a", amountMinor: "100", dimensions: { projectId: "p-1" } }],
    },
  ],
};
const expense = {
  id: "replacement-expense",
  expenseClass: "non_documented",
  expenseDate: "2026-08-08",
  businessPurpose: "Replacement",
  currency: "VND",
  netMinor: "100",
  vatMinor: "0",
  grossMinor: "100",
  counterAccountCode: "1111",
  lines: [
    {
      description: "Replacement",
      netMinor: "100",
      vatMinor: "0",
      grossMinor: "100",
      postingAccountCode: "642",
      allocations: [{ id: "a", amountMinor: "100", dimensions: {} }],
    },
  ],
};

const transactionClient = (kind: "document" | "expense") => {
  const query = vi.fn(async (sql: string) => {
    if (sql === "begin" || sql === "rollback" || sql === "commit") return { rows: [] };
    if (sql.includes("api_idempotency_records") && sql.startsWith("select")) return { rows: [] };
    if (sql.includes("from commercial_documents") && sql.includes("for update"))
      return {
        rows: [
          {
            id: "source-doc",
            type: "sales_invoice",
            state: "issued",
            document_date: "2026-08-01",
            currency: "VND",
            party_id: "client-a",
            document_number: "SI-OLD",
            net_minor: "100",
            tax_minor: "10",
            gross_minor: "110",
            control_account_code: "131",
            original_document_id: null,
            created_by: "finance-a",
            version: "2",
            journal_id: "journal-old",
          },
        ],
      };
    if (sql.includes("from expenses") && sql.includes("for update"))
      return {
        rows: [
          {
            id: "source-expense",
            expense_class: "non_documented",
            state: "posted",
            expense_date: "2026-08-01",
            currency: "VND",
            net_minor: "100",
            vat_minor: "0",
            gross_minor: "100",
            counter_account_code: "1111",
            created_by: "finance-a",
            version: "2",
            employee_party_id: null,
            payee_party_id: null,
            evidence_checklist: {},
            journal_id: "journal-old",
          },
        ],
      };
    if (sql.includes("from fiscal_periods")) return { rows: [{ state: "open" }] };
    if (sql.includes("from journal_entries") && sql.includes("for update"))
      return { rows: [{ state: "posted", currency: "VND", version: "3" }] };
    if (
      (kind === "document" && sql.includes("insert into commercial_documents")) ||
      (kind === "expense" && sql.includes("insert into expenses"))
    )
      throw new Error("replacement insert failed");
    return { rows: [] };
  });
  return { query, release: vi.fn() };
};

describe("portable reverse_replace transaction rollback", () => {
  it("rolls back journal reversal and document cancellation when replacement creation fails", async () => {
    const client = transactionClient("document");
    const store = new PgCommercialDocumentStore();
    (store as unknown as { pool: { connect: () => Promise<typeof client> } }).pool = {
      connect: async () => client,
    };
    await expect(
      store.reverseReplace(context, "source-doc", "2", document, "Correction", "idem-doc"),
    ).rejects.toThrow("replacement insert failed");
    expect(client.query).toHaveBeenCalledWith("rollback");
    expect(client.query).not.toHaveBeenCalledWith("commit");
  });

  it("rolls back journal reversal when replacement expense creation fails", async () => {
    const client = transactionClient("expense");
    const store = new PgExpenseStore();
    (store as unknown as { pool: { connect: () => Promise<typeof client> } }).pool = {
      connect: async () => client,
    };
    await expect(
      store.reverseReplace(context, "source-expense", "2", expense, "Correction", "idem-expense"),
    ).rejects.toThrow("replacement insert failed");
    expect(client.query).toHaveBeenCalledWith("rollback");
    expect(client.query).not.toHaveBeenCalledWith("commit");
  });
});
