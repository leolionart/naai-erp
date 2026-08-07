import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import type { PortableDataPackageContext } from "./portable-data-package.types.js";
import { PortableDataImportService } from "./portable-data-import.service.js";
import type { PortableDryRunResultContract } from "@naai-erp/contracts";
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

class Store implements PortableDataImportStore {
  record?: PortableImportRecord & { parsedSheets?: readonly ParsedPortableSheet[] };
  validationCalls = 0;
  applyCalls = 0;
  async getSourcePackage(c: PortableDataPackageContext, packageId: string) {
    if (c.organizationId !== "org-a" || packageId !== "package-1") return undefined;
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
            resourceType: "parties",
            sheetName: "parties",
            excluded: false,
            schemaVersion: 1,
            dependencyOrder: 10,
            mutability: "editable" as const,
            headerCount: 6,
            rowCount: 1,
            sha256: "b".repeat(64),
          },
        ],
        totalSheetCount: 1,
        totalRowCount: 1,
        packageHash: "c".repeat(64),
      },
      schemas: [schema],
    };
  }
  async saveInventory(_c: PortableDataPackageContext, value: PortableImportInventory) {
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
      packageHash: "c".repeat(64),
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

async function upload(operation: "no_change" | "update" = "no_change") {
  const workbook = new ExcelJS.Workbook();
  const manifest = workbook.addWorksheet("_manifest");
  manifest.addRow(["schema_version", 1]);
  manifest.addRow(["package_id", "package-1"]);
  manifest.addRow(["organization_id", "org-a"]);
  manifest.addRow(["as_of", "2026-08-07"]);
  manifest.addRow(["exported_at", "2026-08-07T00:00:00.000Z"]);
  const parties = workbook.addWorksheet("parties");
  parties.addRow([
    "operation",
    "stableId",
    "expectedResourceVersion",
    "externalReferences",
    "relationships",
    "displayName",
  ]);
  parties.addRow([operation, "party-1", "2", "{}", "{}", "NAAI Edited"]);
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
});
