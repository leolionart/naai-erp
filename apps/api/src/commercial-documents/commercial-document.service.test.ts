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
});
