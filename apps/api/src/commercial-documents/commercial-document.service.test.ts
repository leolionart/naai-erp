import { describe, expect, it, vi } from "vitest";
import { CommercialDocumentService } from "./commercial-document.service.js";

const context = {
  organizationId: "org-a",
  actorId: "finance-a",
  roles: ["finance_admin"],
  correlationId: "corr-a",
} as const;
const sales = {
  type: "sales_invoice" as const,
  documentNumber: "SI-001",
  series: "SI",
  fiscalYear: 2026,
  partyId: "client-a",
  documentDate: "2026-01-25",
  dueDate: "2026-02-24",
  currency: "VND",
  netMinor: "100000000",
  taxMinor: "10000000",
  grossMinor: "110000000",
  controlAccountCode: "131",
  lines: [
    {
      description: "Web app",
      quantity: "1",
      unitPriceMinor: "100000000",
      netMinor: "100000000",
      taxMinor: "10000000",
      grossMinor: "110000000",
      primaryAccountCode: "511",
      taxAccountCode: "3331",
      taxCode: "VAT10",
      allocations: [
        { id: "a", amountMinor: "60000000", dimensions: { projectId: "p-a" } },
        { id: "b", amountMinor: "40000000", dimensions: { projectId: "p-b" } },
      ],
    },
  ],
} as const;

describe("ERP-300 CommercialDocumentService", () => {
  it("deletes only a version-matched draft through the audited store command", async () => {
    const store = {
      deleteDraft: vi.fn().mockResolvedValue({ documentId: "purchase-test", deleted: true }),
    };
    const service = new CommercialDocumentService(store as never, {} as never);
    await expect(
      service.deleteDraft(context, "purchase-test", "1", "Automation test duplicate", "delete-1"),
    ).resolves.toMatchObject({ data: { documentId: "purchase-test", deleted: true } });
    expect(store.deleteDraft).toHaveBeenCalledWith(
      context,
      "purchase-test",
      "1",
      "Automation test duplicate",
      "delete-1",
    );
  });
  it("updates category metadata independently from the final document lifecycle", async () => {
    const store = {
      updateCategory: vi.fn().mockResolvedValue({ documentId: "purchase-1", category: "MEAL" }),
    };
    const service = new CommercialDocumentService(store as never, {} as never);
    const result = await service.updateCategory(
      context,
      "purchase-1",
      { category: "MEAL" },
      "category-1",
    );
    expect(result.data).toMatchObject({ documentId: "purchase-1", category: "MEAL" });
  });
  it("passes customer and project filters to the organization-scoped store", async () => {
    const store = { list: vi.fn().mockResolvedValue([]) };
    const service = new CommercialDocumentService(store as never, {} as never);

    await service.list(context, "sales_invoice", "issued", "client-a", "project-a");

    expect(store.list).toHaveBeenCalledWith("org-a", {
      type: "sales_invoice",
      state: "issued",
      partyId: "client-a",
      projectId: "project-a",
    });
  });

  it("creates an exact allocated document with idempotency", async () => {
    const store = {
      validateRelationships: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue({ documentId: "sales-1", state: "draft" }),
    };
    const service = new CommercialDocumentService(store as never, {} as never);
    const result = await service.create(context, sales, "idem-1");
    expect(store.validateRelationships).toHaveBeenCalledWith("org-a", sales);
    expect(result.data).toMatchObject({ documentId: "sales-1", state: "draft" });
  });
  it("rejects an n8n staging object as validation failure instead of throwing a property error", async () => {
    const service = new CommercialDocumentService({} as never, {} as never);
    await expect(
      service.create(
        context,
        { source: {}, supplier: {}, invoiceCandidate: {}, validation: {} } as never,
        "staging-object-1",
      ),
    ).rejects.toThrow("VALIDATION_FAILED");
  });
  it("rejects a sales project or contract relationship rejected by the store", async () => {
    const store = {
      validateRelationships: vi.fn().mockRejectedValue(new Error("PROJECT_CUSTOMER_MISMATCH")),
      create: vi.fn(),
    };
    const service = new CommercialDocumentService(store as never, {} as never);
    await expect(service.create(context, sales, "relationship-1")).rejects.toThrow(
      "PROJECT_CUSTOMER_MISMATCH",
    );
    expect(store.create).not.toHaveBeenCalled();
  });
  it("keeps purchase VAT unreviewed while an imported invoice remains a draft", async () => {
    const store = {
      create: vi.fn().mockResolvedValue({ documentId: "purchase-1", state: "draft" }),
    };
    const service = new CommercialDocumentService(store as never, {} as never);
    await expect(
      service.create(
        context,
        {
          ...sales,
          type: "purchase_invoice",
          controlAccountCode: "331-AP",
          lines: sales.lines.map((line) => ({
            ...line,
            primaryAccountCode: "642-OPEX",
            taxAccountCode: "1331-VAT",
            allocations: [
              {
                id: "purchase-allocation-1",
                amountMinor: line.netMinor,
                dimensions: { taxState: "unreviewed", source: "erp851-staging" },
              },
            ],
          })),
        },
        "purchase-import-1",
      ),
    ).resolves.toMatchObject({ data: { state: "draft" } });
  });
  it("defaults purchase invoices to owner-paid funding while preserving an explicit company bank", async () => {
    const store = {
      validateRelationships: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue({ documentId: "purchase-owner", state: "draft" }),
    };
    const service = new CommercialDocumentService(store as never, {} as never);
    await service.create(
      context,
      { ...sales, type: "purchase_invoice", controlAccountCode: "331-AP" },
      "purchase-owner-default",
    );
    expect(store.create.mock.calls[0]?.[1]).toMatchObject({
      type: "purchase_invoice",
      funding: { type: "owner_paid" },
    });

    await service.create(
      context,
      {
        ...sales,
        type: "purchase_invoice",
        controlAccountCode: "331-AP",
        funding: { type: "company_bank", financialAccountId: "bank-vnd" },
      },
      "purchase-bank-explicit",
    );
    expect(store.create.mock.calls[1]?.[1]).toMatchObject({
      funding: { type: "company_bank", financialAccountId: "bank-vnd" },
      fundingSource: { type: "financial_account", financialAccountId: "bank-vnd" },
    });

    await service.create(
      context,
      {
        ...sales,
        type: "purchase_invoice",
        controlAccountCode: "331-AP",
        funding: { type: "owner_custody_cash", financialAccountId: "cash-owner" },
      },
      "purchase-custody-explicit",
    );
    expect(store.create.mock.calls[2]?.[1]).toMatchObject({
      funding: { type: "owner_custody_cash", financialAccountId: "cash-owner" },
      fundingSource: { type: "financial_account", financialAccountId: "cash-owner" },
    });
  });
  it("restricts migration source expenses to purchase invoices", async () => {
    const service = new CommercialDocumentService({} as never, {} as never);
    await expect(
      service.create(context, { ...sales, migrationSourceExpenseId: "expense-1" }, "idem"),
    ).rejects.toThrow("MIGRATION_SOURCE_EXPENSE_INVALID");
  });
  it("rejects mismatched allocations and control totals", async () => {
    const service = new CommercialDocumentService({} as never, {} as never);
    await expect(
      service.create(
        context,
        {
          ...sales,
          lines: [
            {
              ...sales.lines[0],
              allocations: [{ id: "a", amountMinor: "999", dimensions: { projectId: "p-a" } }],
            },
          ],
        },
        "idem",
      ),
    ).rejects.toThrow("DOCUMENT_ALLOCATION_MISMATCH");
    await expect(
      service.create(context, { ...sales, grossMinor: "109999999" }, "idem"),
    ).rejects.toThrow("DOCUMENT_CONTROL_TOTAL_MISMATCH");
  });
  it("enforces privileged financial transitions and reason", async () => {
    const store = { transition: vi.fn().mockResolvedValue({ state: "issued" }) };
    const service = new CommercialDocumentService(store as never, {} as never);
    await expect(
      service.transition(
        { ...context, roles: ["integration"] },
        "sales-1",
        "issue",
        { reason: "Issue" },
        "idem",
      ),
    ).rejects.toThrow("FORBIDDEN");
    await expect(service.transition(context, "sales-1", "issue", {}, "idem")).rejects.toThrow(
      "VALIDATION_FAILED",
    );
  });
  describe("update command", () => {
    it("successfully merges and updates a draft document", async () => {
      const existing = {
        id: "sales-1",
        type: "sales_invoice",
        document_number: "SI-001",
        fiscal_year: 2026,
        party_id: "client-a",
        document_date: "2026-01-25",
        due_date: "2026-02-24",
        currency: "VND",
        net_minor: "100000000",
        tax_minor: "10000000",
        gross_minor: "110000000",
        control_account_code: "131",
        state: "draft",
        version: "1",
        lines: [
          {
            lineNumber: 1,
            description: "Web app",
            quantity: "1",
            unitPriceMinor: "100000000",
            netMinor: "100000000",
            taxMinor: "10000000",
            grossMinor: "110000000",
            primaryAccountCode: "511",
            taxAccountCode: "3331",
            taxCode: "VAT10",
            dimensions: { projectId: "p-a" },
            allocations: [
              { amount_minor: "60000000", dimensions: { allocationId: "a", projectId: "p-a" } },
              { amount_minor: "40000000", dimensions: { allocationId: "b", projectId: "p-b" } },
            ],
          },
        ],
        externalReference: {
          system: "sys-1",
          externalId: "ext-1",
        },
      };
      const store = {
        get: vi.fn().mockResolvedValue(existing),
        validateRelationships: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue({ documentId: "sales-1", version: "2" }),
      };
      const service = new CommercialDocumentService(store as never, {} as never);
      const input = {
        documentNumber: "SI-001-rev",
      };
      const result = await service.update(context, "sales-1", "1", input, "idem-2");
      expect(store.update).toHaveBeenCalledWith(
        context,
        "sales-1",
        "1",
        expect.objectContaining({
          documentNumber: "SI-001-rev",
          externalReference: expect.objectContaining({ system: "sys-1", externalId: "ext-1" }),
        }),
        "idem-2",
      );
      expect(store.validateRelationships).toHaveBeenCalledWith(
        "org-a",
        expect.objectContaining({
          lines: [
            expect.objectContaining({
              dimensions: { projectId: "p-a" },
              allocations: [
                expect.objectContaining({ dimensions: { projectId: "p-a" } }),
                expect.objectContaining({ dimensions: { projectId: "p-b" } }),
              ],
            }),
          ],
        }),
      );
      expect(result.data).toEqual({ documentId: "sales-1", version: "2" });
    });
    it("promotes allocation-only category to the owning line field", async () => {
      const store = {
        validateRelationships: vi.fn().mockResolvedValue(undefined),
        create: vi.fn().mockResolvedValue({ documentId: "purchase-1", state: "draft" }),
      };
      const service = new CommercialDocumentService(store as never, {} as never);
      await service.create(
        context,
        {
          ...sales,
          type: "purchase_invoice",
          lines: [
            {
              ...sales.lines[0],
              dimensions: { projectId: "p-a" },
              allocations: [
                {
                  id: "a",
                  amountMinor: "100000000",
                  dimensions: { projectId: "p-a", category: "MEAL" },
                },
              ],
            },
          ],
        },
        "allocation-category",
      );
      expect(store.validateRelationships).toHaveBeenCalledWith(
        "org-a",
        expect.objectContaining({
          lines: [
            expect.objectContaining({
              categoryCode: "MEAL",
              dimensions: { projectId: "p-a" },
              allocations: [expect.objectContaining({ dimensions: { projectId: "p-a" } })],
            }),
          ],
        }),
      );
    });
    it("rejects update if not in draft state", async () => {
      const existing = {
        id: "sales-1",
        state: "issued",
        version: "1",
      };
      const store = { get: vi.fn().mockResolvedValue(existing) };
      const service = new CommercialDocumentService(store as never, {} as never);
      await expect(service.update(context, "sales-1", "1", {}, "idem")).rejects.toThrow(
        "INVALID_STATE_TRANSITION",
      );
    });
    it("rejects update if version conflict occurs", async () => {
      const existing = {
        id: "sales-1",
        state: "draft",
        version: "2",
      };
      const store = { get: vi.fn().mockResolvedValue(existing) };
      const service = new CommercialDocumentService(store as never, {} as never);
      await expect(service.update(context, "sales-1", "1", {}, "idem")).rejects.toThrow(
        "VERSION_CONFLICT",
      );
    });
    it("rejects update for unauthorized role", async () => {
      const service = new CommercialDocumentService({} as never, {} as never);
      await expect(
        service.update({ ...context, roles: ["viewer"] }, "sales-1", "1", {}, "idem"),
      ).rejects.toThrow("FORBIDDEN");
    });
  });
  it("delegates reverse_replace as one canonical store transaction", async () => {
    const store = {
      reverseReplace: vi.fn().mockResolvedValue({
        documentId: "sales-1",
        replacementDocumentId: "sales-2",
        reversalJournalId: "jr-rev",
      }),
    };
    const service = new CommercialDocumentService(store as never, {} as never);
    const result = await service.reverseReplace(
      context,
      "sales-1",
      "3",
      { ...sales, id: "sales-2", documentNumber: "SI-002" },
      "Correct issued invoice",
      "replace-1",
    );
    expect(store.reverseReplace).toHaveBeenCalledWith(
      context,
      "sales-1",
      "3",
      expect.objectContaining({ id: "sales-2" }),
      "Correct issued invoice",
      "replace-1",
    );
    expect(result.data).toMatchObject({ replacementDocumentId: "sales-2" });
  });

  it("allows authorized funding reclassification with optimistic version and idempotency", async () => {
    const store = {
      reclassifyFunding: vi.fn().mockResolvedValue({ replacementDocumentId: "pi-2" }),
    };
    const service = new CommercialDocumentService(store as never, {} as never);
    const result = await service.reclassifyFunding(
      { ...context, roles: ["owner"] },
      "pi-1",
      "4",
      { targetControlAccountCode: "3388", reason: "Owner paid" },
      "funding-1",
    );
    expect(store.reclassifyFunding).toHaveBeenCalledWith(
      expect.anything(),
      "pi-1",
      "4",
      "3388",
      "Owner paid",
      "funding-1",
    );
    expect(result.data).toMatchObject({ replacementDocumentId: "pi-2" });
  });
});
