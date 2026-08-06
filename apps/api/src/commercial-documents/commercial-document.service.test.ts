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
    const store = { create: vi.fn().mockResolvedValue({ documentId: "sales-1", state: "draft" }) };
    const service = new CommercialDocumentService(store as never, {} as never);
    const result = await service.create(context, sales, "idem-1");
    expect(result.data).toMatchObject({ documentId: "sales-1", state: "draft" });
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
      expect(result.data).toEqual({ documentId: "sales-1", version: "2" });
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
});
