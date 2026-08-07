import { createHash } from "node:crypto";
import { canonicalJson } from "@naai-erp/domain";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { PortableDataPackageService } from "./portable-data-package.service.js";
import type {
  PortableDataPackageContext,
  PortableDataPackageStore,
  PortablePackageFile,
  PortablePackageRecord,
  SavePortablePackageInput,
} from "./portable-data-package.types.js";

const context = (organizationId = "org-a", roles = ["owner"]): PortableDataPackageContext => ({
  organizationId,
  actorId: "user-1",
  roles,
  correlationId: "corr-1",
});

class MemoryStore implements PortableDataPackageStore {
  lastInput?: SavePortablePackageInput;
  readonly records = new Map<
    string,
    { record: PortablePackageRecord; file: PortablePackageFile }
  >();
  readonly idempotency = new Map<string, string>();

  async collectOrganizationResources(c: PortableDataPackageContext) {
    return [
      {
        inventory: {
          resourceType: "sales_invoice",
          sheetName: "sales_invoices",
          excluded: false,
          schemaVersion: 1,
          dependencyOrder: 20,
          mutability: "correction_only" as const,
        },
        schema: {
          resourceType: "sales_invoice",
          sheetName: "sales_invoices",
          schemaVersion: 1,
          stableIdColumn: "stableId",
          resourceVersionColumn: "expectedResourceVersion",
          operationColumn: "operation",
          columns: [
            {
              key: "grossAmountMinor",
              header: "grossAmountMinor",
              type: "integer" as const,
              required: true,
              editable: true,
            },
          ],
        },
        rows: [
          {
            rowNumber: 2,
            operation: "no_change" as const,
            stableId: `${c.organizationId}-invoice-1`,
            expectedResourceVersion: "3",
            externalReferences: [{ system: "paperless", externalId: "doc-1" }],
            relationships: { customerId: `${c.organizationId}-customer-1` },
            data: { grossAmountMinor: "1100000" },
          },
        ],
      },
      {
        inventory: {
          resourceType: "evidence_binary",
          excluded: true,
          exclusionReason:
            "Paperless owns document bytes; durable references are exported with documents",
          schemaVersion: 1,
          dependencyOrder: 90,
          mutability: "read_only" as const,
        },
      },
    ];
  }

  async saveExport(
    c: PortableDataPackageContext,
    input: SavePortablePackageInput,
    idempotencyKey: string,
  ) {
    this.lastInput = input;
    const scopeKey = `${c.organizationId}:${idempotencyKey}`;
    const existing = this.idempotency.get(scopeKey);
    if (existing) return this.records.get(existing)!.record;
    const packageId = input.packageId;
    const record: PortablePackageRecord = {
      packageId,
      organizationId: c.organizationId,
      asOf: input.input.asOf,
      format: "xlsx",
      filename: input.filename,
      mediaType: input.mediaType,
      sizeBytes: input.content.length,
      contentHash: input.contentHash,
      manifest: input.manifest,
      generatedAt: input.manifest.exportedAt,
      generatedBy: c.actorId,
      correlationId: c.correlationId,
    };
    this.records.set(packageId, {
      record,
      file: {
        content: input.content,
        filename: input.filename,
        mediaType: input.mediaType,
        contentHash: input.contentHash,
      },
    });
    this.idempotency.set(scopeKey, packageId);
    return record;
  }

  async getExport(c: PortableDataPackageContext, packageId: string) {
    const item = this.records.get(packageId)?.record;
    return item?.organizationId === c.organizationId ? item : undefined;
  }

  async downloadExport(c: PortableDataPackageContext, packageId: string) {
    const item = this.records.get(packageId);
    return item?.record.organizationId === c.organizationId ? item.file : undefined;
  }
}

const service = (store: MemoryStore) =>
  new PortableDataPackageService(store, {
    authenticate: async () => context(),
  } as never);

describe("PortableDataPackageService", () => {
  it("exports every supplied business dataset with inventory and excludes secrets/blob bytes", async () => {
    const store = new MemoryStore();
    const result = (await service(store).createExport(
      context(),
      { asOf: "2026-08-07", format: "xlsx" },
      "export-1",
    )) as { data: PortablePackageRecord };

    expect(result.data.organizationId).toBe("org-a");
    expect(result.data.manifest.totalSheetCount).toBe(1);
    expect(result.data.manifest.totalRowCount).toBe(1);
    expect(result.data.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.data.manifest.sheets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ resourceType: "sales_invoice", excluded: false, rowCount: 1 }),
        expect.objectContaining({ resourceType: "evidence_binary", excluded: true, rowCount: 0 }),
      ]),
    );
    const { packageHash, ...manifestBase } = result.data.manifest;
    expect(packageHash).toBe(
      createHash("sha256")
        .update(canonicalJson({ ...manifestBase, schemas: store.lastInput!.schemas } as never))
        .digest("hex"),
    );

    const file = await store.downloadExport(context(), result.data.packageId);
    expect(createHash("sha256").update(file!.content).digest("hex")).toBe(result.data.contentHash);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file!.content as never);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "_manifest",
      "_schemas",
      "sales_invoices",
    ]);
    expect(workbook.getWorksheet("sales_invoices")?.getRow(1).values).toEqual([
      undefined,
      "operation",
      "stableId",
      "expectedResourceVersion",
      "externalReferences",
      "relationships",
      "grossAmountMinor",
    ]);
    expect(workbook.getWorksheet("sales_invoices")?.getCell("A2").value).toBe("no_change");
  });

  it("enforces role, idempotency key, input validation and organization-scoped reads", async () => {
    const store = new MemoryStore();
    const s = service(store);
    expect(() => s.parseExportInput({ asOf: "07/08/2026", format: "xlsx" })).toThrow(
      "VALIDATION_FAILED",
    );
    await expect(
      s.createExport(context("org-a", ["viewer"]), { asOf: "2026-08-07", format: "xlsx" }, "k"),
    ).rejects.toThrow("FORBIDDEN");
    await expect(s.createExport(context(), { asOf: "2026-08-07", format: "xlsx" })).rejects.toThrow(
      "IDEMPOTENCY_KEY_REQUIRED",
    );

    const created = (await s.createExport(
      context(),
      { asOf: "2026-08-07", format: "xlsx" },
      "k",
    )) as { data: PortablePackageRecord };
    await expect(s.getExport(context("org-b"), created.data.packageId)).rejects.toThrow(
      "RESOURCE_NOT_FOUND",
    );
    await expect(s.download(context("org-b"), created.data.packageId)).rejects.toThrow(
      "RESOURCE_NOT_FOUND",
    );
  });
});
