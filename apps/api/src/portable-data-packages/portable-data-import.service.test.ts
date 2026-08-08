import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import type { PortableDataPackageContext } from "./portable-data-package.types.js";
import { PortableDataImportService } from "./portable-data-import.service.js";
import type { PortableDryRunResultContract } from "@naai-erp/contracts";
import { canonicalJson } from "@naai-erp/domain";
import { createHash } from "node:crypto";
import type {
  ParsedPortableSheet,
  PortableDataImportStore,
  PortableImportCommitResult,
  PortableImportInventory,
  PortableImportRecord,
} from "./portable-data-import.types.js";

const context: PortableDataPackageContext = {
  organizationId: "org-a",
  actorId: "owner-1",
  roles: ["owner"],
  correlationId: "corr-1",
};
const schema = {
  resourceType: "parties",
  sheetName: "parties",
  schemaVersion: 1,
  stableIdColumn: "stableId",
  resourceVersionColumn: "expectedResourceVersion",
  operationColumn: "operation",
  columns: [
    {
      key: "displayName",
      header: "displayName",
      type: "string" as const,
      required: true,
      editable: true,
    },
  ],
};
const inventorySheet = {
  resourceType: "parties",
  sheetName: "parties",
  excluded: false,
  schemaVersion: 1,
  dependencyOrder: 10,
  mutability: "editable" as const,
  headerCount: 6,
  rowCount: 1,
  sha256: "b".repeat(64),
};
const embeddedPackageHash = createHash("sha256")
  .update(
    canonicalJson({
      schemaVersion: 1,
      packageId: "package-1",
      organizationId: "org-a",
      exportedAt: "2026-08-07T00:00:00.000Z",
      asOf: "2026-08-07",
      exportedBy: "owner-1",
      sourceSystem: "naai-erp",
      sourceApiVersion: "v1",
      hashAlgorithm: "sha256",
      sheets: [inventorySheet],
      schemas: [schema],
      totalSheetCount: 1,
      totalRowCount: 1,
    } as never),
  )
  .digest("hex");

class Store implements PortableDataImportStore {
  constructor(
    private readonly sourceAvailable = true,
    private readonly applySuccess = false,
  ) {}
  record?: PortableImportRecord & { parsedSheets?: readonly ParsedPortableSheet[] };
  savedInventory?: PortableImportInventory;
  validationCalls = 0;
  applyCalls = 0;
  async restoreEmptyOrganization() {
    return {
      sourceOrganizationId: "source",
      targetOrganizationId: "org-a",
      packageId: "package-1",
      workbookSha256: "a".repeat(64),
      restoredRows: 0,
      restoredByResource: {},
      sourceHash: "b".repeat(64),
      targetHash: "b".repeat(64),
      balancedJournalCount: 0,
      auditEventId: "audit",
      idempotencyReplayed: false,
    };
  }
  async getSourcePackage(c: PortableDataPackageContext, packageId: string) {
    if (!this.sourceAvailable || c.organizationId !== "org-a" || packageId !== "package-1")
      return undefined;
    return {
      manifest: {
        schemaVersion: 1 as const,
        packageId,
        organizationId: c.organizationId,
        exportedAt: "2026-08-07T00:00:00.000Z",
        asOf: "2026-08-07T00:00:00.000Z",
        exportedBy: "owner-1",
        sourceSystem: "naai-erp" as const,
        sourceApiVersion: "v1" as const,
        hashAlgorithm: "sha256" as const,
        workbookSha256: "a".repeat(64),
        sheets: [
          {
            ...inventorySheet,
          },
        ],
        totalSheetCount: 1,
        totalRowCount: 1,
        packageHash: embeddedPackageHash,
      },
      schemas: [schema],
    };
  }
  async saveInventory(_c: PortableDataPackageContext, value: PortableImportInventory) {
    this.savedInventory = value;
    this.record = {
      importId: value.importId,
      packageId: value.packageId,
      organizationId: value.organizationId,
      state: "inventoried",
      workbookSha256: value.workbookSha256,
      packageHash: value.packageHash,
      parsedSheets: value.parsedSheets,
    };
    return this.record;
  }
  async getImport(c: PortableDataPackageContext, importId: string) {
    return this.record?.organizationId === c.organizationId && this.record.importId === importId
      ? this.record
      : undefined;
  }
  async saveDryRun(
    _c: PortableDataPackageContext,
    importId: string,
    dryRunId: string,
    result: PortableDryRunResultContract,
    parsedSheets: readonly ParsedPortableSheet[],
  ) {
    this.record = {
      importId,
      packageId: "package-1",
      organizationId: "org-a",
      state: result.valid ? "dry_run_valid" : "dry_run_invalid",
      workbookSha256: this.record?.workbookSha256 ?? "",
      packageHash: embeddedPackageHash,
      dryRunId,
      dryRun: result,
      parsedSheets,
    };
    return this.record;
  }
  async validateCanonicalRow() {
    this.validationCalls += 1;
    return { disposition: "ready" as const, resolvedReferences: {} };
  }
  async applyCanonicalRow() {
    this.applyCalls += 1;
    if (this.applySuccess)
      return { applied: true as const, stableId: `applied-${this.applyCalls}` };
    return {
      applied: false as const,
      issue: {
        code: "UNSUPPORTED_OPERATION",
        message: "Canonical mutation is not implemented",
        severity: "error" as const,
      },
    };
  }
  async saveCommit(
    _c: PortableDataPackageContext,
    _id: string,
    result: PortableImportCommitResult,
  ) {
    this.record = {
      ...this.record!,
      state: result.committed ? "committed" : "dry_run_valid",
      commitResult: result,
    };
    return this.record;
  }
}

async function upload(operation: "no_change" | "update" = "no_change", secondMutation = false) {
  const workbook = new ExcelJS.Workbook();
  const manifest = workbook.addWorksheet("_manifest");
  manifest.addRow(["schema_version", 1]);
  manifest.addRow(["package_id", "package-1"]);
  manifest.addRow(["organization_id", "org-a"]);
  manifest.addRow(["as_of", "2026-08-07"]);
  manifest.addRow(["exported_at", "2026-08-07T00:00:00.000Z"]);
  manifest.addRow(["exported_by", "owner-1"]);
  manifest.addRow(["package_hash", embeddedPackageHash]);
  manifest.addRow([]);
  manifest.addRow([
    "resource_type",
    "sheet_name",
    "excluded",
    "exclusion_reason",
    "schema_version",
    "dependency_order",
    "mutability",
    "header_count",
    "row_count",
    "sha256",
  ]);
  manifest.addRow(["parties", "parties", false, null, 1, 10, "editable", 6, 1, "b".repeat(64)]);
  const schemas = workbook.addWorksheet("_schemas");
  schemas.addRow(["resource_type", "schema_json"]);
  schemas.addRow(["parties", canonicalJson(schema as never)]);
  const parties = workbook.addWorksheet("parties");
  parties.addRow([
    "operation",
    "stableId",
    "expectedResourceVersion",
    "externalReferences",
    "relationships",
    "displayName",
  ]);
  parties.addRow([operation, "party-1", "2", "[]", "{}", "NAAI Edited"]);
  if (secondMutation) parties.addRow([operation, "party-2", "1", "[]", "{}", "Second Edit"]);
  return { filename: "package.xlsx", content: Buffer.from(await workbook.xlsx.writeBuffer()) };
}

describe("PortableDataImportService", () => {
  it("inventories a complete organization-scoped workbook and dry-runs with zero mutations", async () => {
    const store = new Store();
    const service = new PortableDataImportService(store);
    const inventory = (await service.inventory(context, await upload(), "inventory-1")) as {
      data: PortableImportRecord;
    };
    expect(inventory.data.state).toBe("inventoried");
    const dryRun = (await service.dryRun(context, await upload("update"), "dry-run-1")) as {
      data: PortableImportRecord;
    };
    expect(dryRun.data.dryRun).toMatchObject({
      dryRun: true,
      mutationCount: 0,
      valid: true,
      totals: { ready: 1 },
    });
    expect(store.validationCalls).toBe(1);
    expect(store.applyCalls).toBe(0);
  });

  it("inventories a self-contained workbook after its original export record is unavailable", async () => {
    const store = new Store(false);
    const service = new PortableDataImportService(store);
    const inventory = (await service.inventory(context, await upload(), "detached-inventory")) as {
      data: PortableImportRecord;
    };
    expect(inventory.data).toMatchObject({ packageId: "package-1", state: "inventoried" });
    expect(store.savedInventory?.sourcePackage).toMatchObject({
      filename: "package.xlsx",
      manifest: { packageId: "package-1", packageHash: embeddedPackageHash },
      schemas: [schema],
    });
    expect(store.savedInventory?.sourcePackage?.content).toEqual(expect.any(Buffer));
  });

  it("does not carry duplicate source bytes when the package is already registered", async () => {
    const store = new Store(true);
    const service = new PortableDataImportService(store);
    await service.inventory(context, await upload(), "registered-inventory");
    expect(store.savedInventory?.sourcePackage).toBeUndefined();
  });

  it("rejects cross-organization workbooks and commit precondition mismatches", async () => {
    const store = new Store();
    const service = new PortableDataImportService(store);
    await expect(
      service.inventory({ ...context, organizationId: "org-b" }, await upload(), "k"),
    ).rejects.toThrow("ORGANIZATION_MISMATCH");
    const dryRun = (await service.dryRun(context, await upload("update"), "dry")) as {
      data: PortableImportRecord;
    };
    await expect(
      service.commit(
        context,
        dryRun.data.importId,
        { dryRunId: "wrong", workbookSha256: dryRun.data.workbookSha256 },
        "commit",
      ),
    ).rejects.toThrow("COMMIT_PRECONDITION_FAILED");
  });

  it("delegates commit to canonical mutations and returns unsupported operations as structured failures", async () => {
    const store = new Store();
    const service = new PortableDataImportService(store);
    const dryRun = (await service.dryRun(context, await upload("update"), "dry")) as {
      data: PortableImportRecord;
    };
    const committed = (await service.commit(
      context,
      dryRun.data.importId,
      { dryRunId: dryRun.data.dryRunId, workbookSha256: dryRun.data.workbookSha256 },
      "commit",
    )) as { data: PortableImportRecord };
    expect(store.applyCalls).toBe(1);
    expect(committed.data.commitResult).toMatchObject({
      committed: false,
      applied: 0,
      failed: 1,
      rows: [{ issues: [{ code: "UNSUPPORTED_OPERATION" }] }],
    });
  });

  it("revalidates and permits multi-row non-posting master-data updates", async () => {
    const store = new Store(true, true);
    const service = new PortableDataImportService(store);
    const dryRun = (await service.dryRun(context, await upload("update", true), "dry-batch")) as {
      data: PortableImportRecord;
    };
    const committed = (await service.commit(
      context,
      dryRun.data.importId,
      { dryRunId: dryRun.data.dryRunId, workbookSha256: dryRun.data.workbookSha256 },
      "commit-batch",
    )) as { data: PortableImportRecord };
    expect(store.applyCalls).toBe(2);
    expect(committed.data.commitResult).toMatchObject({ committed: true, applied: 2, failed: 0 });
  });

  it("guards empty-tenant restore with owner, confirmation, reason, idempotency and workbook hash", async () => {
    const service = new PortableDataImportService(new Store());
    const input = {
      sourceOrganizationId: "source-org",
      confirmTargetOrganizationId: "org-a",
      packageId: "package-1",
      workbookSha256: "a".repeat(64),
      reason: "Production cutover",
      workbookBase64: Buffer.from("not-the-declared-workbook").toString("base64"),
      mapSourceActorsToTargetActor: true as const,
    };
    await expect(
      service.restoreEmptyOrganization({ ...context, roles: ["accountant"] }, input, "restore"),
    ).rejects.toThrow("FORBIDDEN");
    await expect(service.restoreEmptyOrganization(context, input)).rejects.toThrow(
      "IDEMPOTENCY_KEY_REQUIRED",
    );
    await expect(
      service.restoreEmptyOrganization(
        context,
        { ...input, confirmTargetOrganizationId: "wrong" },
        "restore",
      ),
    ).rejects.toThrow("VALIDATION_FAILED");
    await expect(service.restoreEmptyOrganization(context, input, "restore")).rejects.toThrow(
      "WORKBOOK_SHA256_MISMATCH",
    );
  });
});
