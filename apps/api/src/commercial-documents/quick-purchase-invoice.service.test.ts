import { describe, expect, it, vi } from "vitest";
import { QuickPurchaseInvoiceService } from "./quick-purchase-invoice.service.js";

const context = {
  organizationId: "org-a",
  actorId: "integration-a",
  roles: ["integration"],
  correlationId: "corr-a",
} as const;

const input = {
  supplierTaxId: "0110660175",
  supplierName: "V-GREEN",
  documentNumber: "00250571",
  documentDate: "2026-07-27",
  category: "BATTERY_RENTAL",
  description: "Phí dịch vụ trạm sạc",
  grossMinor: "408601",
} as const;

function masterWith(rows: Record<string, readonly Record<string, unknown>[]>) {
  return {
    export: vi.fn(async (resource: string) => ({ data: rows[resource] ?? [] })),
    mutate: vi.fn(async (_action, resource, _key, _context, mutation) => ({
      data: { resource: mutation.data, mutation: { auditEventId: `${resource}-audit` } },
    })),
  };
}

describe("ERP-913 QuickPurchaseInvoiceService", () => {
  it("creates a missing supplier and role then sends one canonical zero-VAT invoice", async () => {
    const master = masterWith({
      parties: [],
      "party-roles": [],
      dimensions: [{ kind: "category", code: "BATTERY_RENTAL", is_active: true }],
      "default-mappings": [],
      accounts: [
        { code: "642-COST", root_type: "expense", is_active: true },
        { code: "331-AP", root_type: "liability", is_control_account: true, is_active: true },
      ],
    });
    const documents = {
      create: vi.fn().mockResolvedValue({
        apiVersion: "v1",
        requestId: "corr-a",
        organizationId: "org-a",
        data: { documentId: "purchase-1", state: "draft" },
      }),
    };
    const service = new QuickPurchaseInvoiceService(master as never, documents as never);

    const result = await service.create(context, input, "paperless-246-v1");

    expect(master.mutate).toHaveBeenCalledTimes(2);
    expect(documents.create).toHaveBeenCalledWith(
      context,
      expect.objectContaining({
        type: "purchase_invoice",
        partyId: "party-tax-0110660175",
        netMinor: "408601",
        taxMinor: "0",
        grossMinor: "408601",
        controlAccountCode: "331-AP",
        lines: [
          expect.objectContaining({
            primaryAccountCode: "642-COST",
            categoryCode: "BATTERY_RENTAL",
            allocations: [
              expect.objectContaining({
                amountMinor: "408601",
                dimensions: { taxState: "unreviewed" },
              }),
            ],
          }),
        ],
      }),
      "paperless-246-v1",
    );
    expect(documents.create.mock.calls[0]?.[1]).not.toHaveProperty("fundingSource");
    expect(result.data).toMatchObject({
      supplier: { partyId: "party-tax-0110660175", disposition: "created" },
      document: { documentId: "purchase-1" },
    });
  });

  it("reuses an existing supplier and only adds a missing supplier role", async () => {
    const master = masterWith({
      parties: [{ id: "supplier-existing", normalized_tax_id: "0110660175", status: "active" }],
      "party-roles": [],
      dimensions: [{ kind: "category", code: "BATTERY_RENTAL", is_active: true }],
      "default-mappings": [
        { category_code: "BATTERY_RENTAL", account_code: "632-COST", effective_from: "2026-01-01" },
      ],
      accounts: [
        { code: "632-COST", root_type: "expense", is_active: true },
        { code: "331-AP", root_type: "liability", is_control_account: true, is_active: true },
      ],
    });
    const documents = { create: vi.fn().mockResolvedValue({ data: { documentId: "purchase-2" } }) };
    const service = new QuickPurchaseInvoiceService(master as never, documents as never);

    await service.create(
      context,
      {
        supplierTaxId: input.supplierTaxId,
        documentNumber: input.documentNumber,
        documentDate: input.documentDate,
        category: input.category,
        description: input.description,
        grossMinor: input.grossMinor,
      },
      "paperless-247-v1",
    );

    expect(master.mutate).toHaveBeenCalledTimes(1);
    expect(master.mutate).toHaveBeenCalledWith(
      "create",
      "party-roles",
      undefined,
      context,
      { data: { party_id: "supplier-existing", role: "supplier" } },
      "paperless-247-v1:supplier-role",
    );
    expect(documents.create).toHaveBeenCalledWith(
      context,
      expect.objectContaining({ partyId: "supplier-existing" }),
      "paperless-247-v1",
    );
  });

  it("matches a supplier by normalized name when the UI omits tax ID", async () => {
    const master = masterWith({
      parties: [{ id: "supplier-name", display_name: "Công ty Ánh Dương", status: "active" }],
      "party-roles": [{ party_id: "supplier-name", role: "supplier" }],
      dimensions: [{ kind: "category", code: "BATTERY_RENTAL", is_active: true }],
      "default-mappings": [],
      accounts: [
        { code: "642-COST", root_type: "expense", is_active: true },
        { code: "331-AP", root_type: "liability", is_control_account: true, is_active: true },
      ],
    });
    const documents = {
      create: vi.fn().mockResolvedValue({ data: { documentId: "purchase-name" } }),
    };
    const service = new QuickPurchaseInvoiceService(master as never, documents as never);

    const withoutTaxId = {
      supplierName: input.supplierName,
      documentNumber: input.documentNumber,
      documentDate: input.documentDate,
      description: input.description,
      grossMinor: input.grossMinor,
      category: input.category,
    };
    await service.create(
      context,
      { ...withoutTaxId, supplierName: "cong ty anh duong" },
      "purchase-by-name",
    );

    expect(master.mutate).not.toHaveBeenCalled();
    expect(documents.create).toHaveBeenCalledWith(
      context,
      expect.objectContaining({ partyId: "supplier-name" }),
      "purchase-by-name",
    );
  });

  it("rejects ambiguous supplier names without mutating master data", async () => {
    const master = masterWith({
      parties: [
        { id: "supplier-a", display_name: "Nhà cung cấp A", status: "active" },
        { id: "supplier-b", legal_name: "Nha cung cap A", status: "active" },
      ],
      dimensions: [{ kind: "category", code: "BATTERY_RENTAL", is_active: true }],
      "expense-categories": [{ code: "BATTERY_RENTAL", is_active: true }],
      accounts: [
        { code: "642-COST", root_type: "expense", is_active: true },
        { code: "331-AP", root_type: "liability", is_control_account: true, is_active: true },
      ],
    });
    const documents = { create: vi.fn() };
    const service = new QuickPurchaseInvoiceService(master as never, documents as never);

    const withoutTaxId = {
      supplierName: input.supplierName,
      documentNumber: input.documentNumber,
      documentDate: input.documentDate,
      description: input.description,
      grossMinor: input.grossMinor,
      category: input.category,
    };
    await expect(
      service.create(
        context,
        { ...withoutTaxId, supplierName: "Nha cung cap A" },
        "ambiguous-supplier",
      ),
    ).rejects.toThrow("SUPPLIER_AMBIGUOUS");
    expect(master.mutate).not.toHaveBeenCalled();
    expect(documents.create).not.toHaveBeenCalled();
  });

  it("rejects invalid minimal data before creating supplier or invoice", async () => {
    const master = masterWith({});
    const documents = { create: vi.fn() };
    const service = new QuickPurchaseInvoiceService(master as never, documents as never);

    await expect(
      service.create(context, { ...input, supplierTaxId: "unknown" }, "key"),
    ).rejects.toThrow("VALIDATION_FAILED");
    expect(master.mutate).not.toHaveBeenCalled();
    expect(documents.create).not.toHaveBeenCalled();
  });

  it("infers the canonical category from a similar OCR description", async () => {
    const master = masterWith({
      parties: [{ id: "supplier-existing", normalized_tax_id: "0110660175", status: "active" }],
      "party-roles": [{ party_id: "supplier-existing", role: "supplier" }],
      // ERP-937: the unified business category catalog is canonical. Keep the
      // legacy dimensions omitted here so this test exercises the production
      // read path and its canonical display name.
      categories: [
        { kind: "expense", code: "BATTERY_RENTAL", name: "Chi phí thuê pin", is_active: true },
        {
          kind: "expense",
          code: "OFFICE_SUPPLIES",
          name: "Chi phí văn phòng phẩm",
          is_active: true,
        },
      ],
      "default-mappings": [],
      accounts: [
        { code: "642-COST", root_type: "expense", is_active: true },
        { code: "331-AP", root_type: "liability", is_control_account: true, is_active: true },
      ],
    });
    const documents = {
      create: vi.fn().mockResolvedValue({ data: { documentId: "purchase-inferred" } }),
    };
    const service = new QuickPurchaseInvoiceService(master as never, documents as never);
    const result = await service.create(
      context,
      {
        supplierTaxId: input.supplierTaxId,
        supplierName: input.supplierName,
        documentNumber: input.documentNumber,
        documentDate: input.documentDate,
        description: "Chi phí thuê pin sạc tháng 7 năm 2026",
        grossMinor: input.grossMinor,
      },
      "paperless-inferred-v1",
    );

    expect(documents.create).toHaveBeenCalledWith(
      context,
      expect.objectContaining({
        lines: [
          expect.objectContaining({
            categoryCode: "BATTERY_RENTAL",
            allocations: [
              expect.objectContaining({
                dimensions: { taxState: "unreviewed" },
              }),
            ],
          }),
        ],
      }),
      "paperless-inferred-v1",
    );
    expect(result.data.category).toEqual({
      code: "BATTERY_RENTAL",
      name: "Chi phí thuê pin",
      disposition: "similarity",
    });
  });

  it("rejects an unknown category before creating supplier master data", async () => {
    const master = masterWith({
      parties: [],
      "party-roles": [],
      dimensions: [{ kind: "category", code: "OFFICE_SUPPLIES", name: "Văn phòng phẩm" }],
      "expense-categories": [
        { code: "OFFICE_SUPPLIES", name: "Chi phí văn phòng phẩm", is_active: true },
      ],
    });
    const documents = { create: vi.fn() };
    const service = new QuickPurchaseInvoiceService(master as never, documents as never);

    await expect(
      service.create(
        context,
        { ...input, category: "Chi phí quảng cáo truyền hình" },
        "paperless-unknown-category",
      ),
    ).rejects.toThrow("CATEGORY_NOT_FOUND");
    expect(master.mutate).not.toHaveBeenCalled();
    expect(documents.create).not.toHaveBeenCalled();
  });
});
