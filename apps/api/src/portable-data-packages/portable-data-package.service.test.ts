import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { PortableDataPackageService } from "./portable-data-package.service.js";
import type {
  LocalOrganizationResetInput,
  PortableDataPackageContext,
  PortableDataPackageStore,
  PortablePackageFile,
  PortablePackageRecord,
  PortableResourceExport,
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
  readonly prunedPackages = new Set<string>();
  readonly records = new Map<
    string,
    { record: PortablePackageRecord; file: PortablePackageFile }
  >();
  readonly idempotency = new Map<string, string>();

  async collectOrganizationResources(
    c: PortableDataPackageContext,
  ): Promise<readonly PortableResourceExport[]> {
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
    if (item?.record.organizationId !== c.organizationId) return undefined;
    if (this.prunedPackages.has(packageId)) throw new Error("EXPORT_CONTENT_PRUNED");
    return item.file;
  }

  async resetLocalOrganization(
    c: PortableDataPackageContext,
    input: LocalOrganizationResetInput,
    _idempotencyKey: string,
  ) {
    return {
      organizationId: c.organizationId,
      packageId: input.packageId,
      workbookSha256: input.workbookSha256,
      deletedRows: 2,
      deletedByTable: { expenses: 2 },
      preservedTables: ["organizations"],
      auditEventId: "audit-reset-1",
      idempotencyReplayed: false,
    };
  }
}

class DispositionMemoryStore extends MemoryStore {
  override async collectOrganizationResources(
    c: PortableDataPackageContext,
  ): Promise<readonly PortableResourceExport[]> {
    const [salesInvoice, evidenceBinary] = await super.collectOrganizationResources(c);
    const resource = (
      resourceType: string,
      rows: readonly Record<string, string | boolean | null>[],
    ): PortableResourceExport => ({
      inventory: {
        resourceType,
        sheetName: resourceType,
        excluded: false,
        schemaVersion: 1,
        dependencyOrder: 30,
        mutability: "read_only" as const,
      },
      schema: {
        resourceType,
        sheetName: resourceType,
        schemaVersion: 1,
        stableIdColumn: "stableId",
        operationColumn: "operation",
        columns: [
          {
            key: "value",
            header: "value",
            type: "string" as const,
            required: false,
            editable: false,
          },
        ],
      },
      rows: rows.map((data, index) => ({
        rowNumber: index + 2,
        operation: "no_change" as const,
        stableId: `${resourceType}-${index + 1}`,
        externalReferences: [],
        relationships: {},
        data,
      })),
    });
    return [
      salesInvoice!,
      resource("projects", []),
      resource("commercial_document_lines", [{ value: "already embedded" }]),
      resource("webhook_delivery_attempts", [{ value: "runtime replay state" }]),
      resource("expense_events", [{ value: "append-only operational event" }]),
      evidenceBinary!,
    ];
  }
}

const service = (store: PortableDataPackageStore) =>
  new PortableDataPackageService(store, {
    authenticate: async () => context(),
  } as never);

describe("PortableDataPackageService", () => {
  it("allows an owner reset only in an explicitly enabled loopback runtime", async () => {
    const previous = process.env.NAAI_ERP_LOCAL_RESET_ENABLED;
    process.env.NAAI_ERP_LOCAL_RESET_ENABLED = "1";
    try {
      const store = new MemoryStore();
      const result = await service(store).resetLocalOrganization(
        context(),
        {
          confirmOrganizationId: "org-a",
          packageId: "package-1",
          workbookSha256: "a".repeat(64),
        },
        "127.0.0.1:3001",
        "reset-1",
      );
      expect(result.data).toMatchObject({ organizationId: "org-a", deletedRows: 2 });
      await expect(
        service(store).resetLocalOrganization(
          context(),
          {
            confirmOrganizationId: "org-a",
            packageId: "package-1",
            workbookSha256: "a".repeat(64),
          },
          "erp.example.com",
          "reset-2",
        ),
      ).rejects.toThrow("LOCAL_RESET_NOT_ALLOWED");
      const previousNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";
      await expect(
        service(store).resetLocalOrganization(
          context(),
          {
            confirmOrganizationId: "org-a",
            packageId: "package-1",
            workbookSha256: "a".repeat(64),
          },
          "localhost:3001",
          "reset-production",
        ),
      ).rejects.toThrow("LOCAL_RESET_NOT_ALLOWED");
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      await expect(
        service(store).resetLocalOrganization(
          context("org-a", ["accountant"]),
          {
            confirmOrganizationId: "org-a",
            packageId: "package-1",
            workbookSha256: "a".repeat(64),
          },
          "localhost:3001",
          "reset-3",
        ),
      ).rejects.toThrow("FORBIDDEN");
    } finally {
      if (previous === undefined) delete process.env.NAAI_ERP_LOCAL_RESET_ENABLED;
      else process.env.NAAI_ERP_LOCAL_RESET_ENABLED = previous;
    }
  });

  it("requires exact organization confirmation and a SHA-256 backup checksum", async () => {
    expect(() =>
      service(new MemoryStore()).parseLocalResetInput({
        confirmOrganizationId: "org-a",
        packageId: "package-1",
        workbookSha256: "short",
      }),
    ).toThrow("VALIDATION_FAILED");
    process.env.NAAI_ERP_LOCAL_RESET_ENABLED = "1";
    await expect(
      service(new MemoryStore()).resetLocalOrganization(
        context(),
        {
          confirmOrganizationId: "org-b",
          packageId: "package-1",
          workbookSha256: "b".repeat(64),
        },
        "localhost",
        "reset-mismatch",
      ),
    ).rejects.toThrow("ORGANIZATION_CONFIRMATION_MISMATCH");
    delete process.env.NAAI_ERP_LOCAL_RESET_ENABLED;
  });
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
    expect(result.data.manifest.packageHash).toMatch(/^[a-f0-9]{64}$/);

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

  it("records reviewed exclusions without creating empty, embedded-child or operational sheets", async () => {
    const store = new DispositionMemoryStore();
    const result = (await service(store).createExport(
      context(),
      { asOf: "2026-08-07", format: "xlsx" },
      "export-reviewed-disposition",
    )) as { data: PortablePackageRecord };

    expect(result.data.manifest.totalSheetCount).toBe(1);
    expect(result.data.manifest.sheets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          resourceType: "projects",
          excluded: true,
          rowCount: 0,
          exclusionReason: expect.stringContaining("no rows"),
        }),
        expect.objectContaining({
          resourceType: "commercial_document_lines",
          excluded: true,
          rowCount: 0,
          exclusionReason: expect.stringContaining("embedded"),
        }),
        expect.objectContaining({
          resourceType: "webhook_delivery_attempts",
          excluded: true,
          rowCount: 0,
          exclusionReason: expect.stringContaining("operational"),
        }),
        expect.objectContaining({
          resourceType: "expense_events",
          excluded: true,
          rowCount: 0,
          exclusionReason: expect.stringContaining("operational"),
        }),
      ]),
    );

    const file = await store.downloadExport(context(), result.data.packageId);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file!.content as never);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "_manifest",
      "_schemas",
      "sales_invoices",
    ]);
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

  it("keeps pruned export metadata readable while rejecting the expired binary download", async () => {
    const store = new MemoryStore();
    const s = service(store);
    const created = (await s.createExport(
      context(),
      { asOf: "2026-08-07", format: "xlsx" },
      "export-to-prune",
    )) as { data: PortablePackageRecord };
    store.prunedPackages.add(created.data.packageId);

    await expect(s.getExport(context(), created.data.packageId)).resolves.toMatchObject({
      data: { packageId: created.data.packageId, contentHash: created.data.contentHash },
    });
    await expect(s.download(context(), created.data.packageId)).rejects.toThrow(
      "EXPORT_CONTENT_PRUNED",
    );
  });
});
