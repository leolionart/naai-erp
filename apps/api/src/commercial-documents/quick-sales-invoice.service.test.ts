import { describe, expect, it, vi } from "vitest";
import { QuickSalesInvoiceService } from "./quick-sales-invoice.service.js";

const context = {
  organizationId: "org",
  actorId: "integration",
  roles: ["integration"],
  correlationId: "corr",
} as const;
const base = {
  customerName: "Cong ty ABC",
  customerTaxId: "0110660175",
  documentNumber: "INV-1",
  documentDate: "2026-08-22",
  description: "Dich vu thang 8",
  grossMinor: "1000000",
  project: "P-1",
  category: "SERVICE",
} as const;
function master(overrides: Record<string, readonly Record<string, unknown>[]> = {}) {
  const data = {
    parties: [
      {
        id: "client",
        display_name: "Cong ty ABC",
        normalized_tax_id: "0110660175",
        status: "active",
      },
    ],
    "party-roles": [{ party_id: "client", role: "client" }],
    projects: [
      { id: "project", code: "P-1", name: "Project 1", client_party_id: "client", is_active: true },
    ],
    dimensions: [{ kind: "category", code: "SERVICE", name: "Service", is_active: true }],
    accounts: [
      { code: "511", root_type: "revenue", is_active: true },
      { code: "131", root_type: "asset", is_control_account: true, is_active: true },
    ],
    ...overrides,
  };
  return {
    export: vi.fn(async (r: string) => ({ data: data[r as keyof typeof data] ?? [] })),
    mutate: vi.fn(),
  };
}
describe("QuickSalesInvoiceService", () => {
  it("matches customer, project and category in one request", async () => {
    const m = master();
    const documents = { create: vi.fn().mockResolvedValue({ data: { documentId: "sale" } }) };
    const service = new QuickSalesInvoiceService(m as never, documents as never);
    const result = await service.create(context, base, "idem");
    expect(m.mutate).not.toHaveBeenCalled();
    expect(documents.create).toHaveBeenCalledWith(
      context,
      expect.objectContaining({
        type: "sales_invoice",
        partyId: "client",
        controlAccountCode: "131",
        lines: [
          expect.objectContaining({
            primaryAccountCode: "511",
            categoryCode: "SERVICE",
            allocations: [
              expect.objectContaining({
                dimensions: { projectId: "project" },
              }),
            ],
          }),
        ],
      }),
      "idem",
    );
    expect(result.data.customer.disposition).toBe("existing");
  });
  it("rejects ambiguous customer names before mutation", async () => {
    const m = master({
      parties: [
        { id: "a", display_name: "ABC" },
        { id: "b", legal_name: "ABC" },
      ],
    });
    const service = new QuickSalesInvoiceService(m as never, { create: vi.fn() } as never);
    const withoutTax = {
      customerName: base.customerName,
      documentNumber: base.documentNumber,
      documentDate: base.documentDate,
      description: base.description,
      grossMinor: base.grossMinor,
      project: base.project,
      category: base.category,
    };
    await expect(
      service.create(context, { ...withoutTax, customerName: "ABC" }, "idem"),
    ).rejects.toThrow("CUSTOMER_AMBIGUOUS");
    expect(m.mutate).not.toHaveBeenCalled();
  });
  it("rejects a project owned by another customer", async () => {
    const m = master({
      projects: [{ id: "project", code: "P-1", client_party_id: "other", is_active: true }],
    });
    const service = new QuickSalesInvoiceService(m as never, { create: vi.fn() } as never);
    await expect(service.create(context, base, "idem")).rejects.toThrow(
      "PROJECT_CUSTOMER_MISMATCH",
    );
  });
});
