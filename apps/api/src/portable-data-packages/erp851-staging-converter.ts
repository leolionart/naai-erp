import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  PORTABLE_DATA_PACKAGE_HASH_ALGORITHM,
  PORTABLE_DATA_PACKAGE_SCHEMA_VERSION,
  type PortableDataPackageManifestContract,
  type PortableRowEnvelopeContract,
  type PortableSheetInventoryContract,
  type PortableSheetSchemaContract,
} from "@naai-erp/contracts";
import { canonicalJson, hashPortableRows } from "@naai-erp/domain";
import ExcelJS from "exceljs";

export const ERP851_STAGING_SHA256 =
  "4b86f0f37ebf21067269abff34fef19ef06c245c12bf913361927fd104ce9918";
export const ERP851_CONVERTER_VERSION = 9 as const;

export type Erp851ReviewedAccountMapping = Readonly<{
  purchaseControlAccountCode: string;
  purchasePrimaryAccountCode: string;
  purchaseTaxAccountCode?: string;
  expenseOwnerCounterAccountCode: string;
  expenseCompanyCounterAccountCode: string;
  expenseUnknownCounterAccountCode?: string;
  expensePostingAccountCode: string;
  expenseVatAccountCode?: string;
}>;

export type Erp851ConverterInput = Readonly<{
  sourceWorkbookPath: string;
  organizationId: string;
  reviewedAccountMapping?: Erp851ReviewedAccountMapping;
  sourceInspectionPath?: string;
  asOf?: string;
}>;

export type Erp851ConversionResult = Readonly<{
  content: Buffer;
  manifest: PortableDataPackageManifestContract;
  sourceWorkbookSha256: string;
  controls: Readonly<{
    parties: number;
    projects: number;
    purchaseInvoices: number;
    expenses: number;
    expensesImportable: number;
    revenueActivitiesExcluded: number;
    brokenPurchaseHeadersExcluded: number;
    incompletePurchaseHeadersExcluded: number;
    sourceExceptionsExcluded: number;
    purchaseGrossMinor: string;
    expenseGrossMinor: string;
  }>;
}>;

type SourceTable = Readonly<{ values: readonly (readonly unknown[])[] }>;
type SourceRecord = Readonly<Record<string, unknown>>;
type Resource = Readonly<{
  inventory: Omit<PortableSheetInventoryContract, "headerCount" | "rowCount" | "sha256">;
  schema?: PortableSheetSchemaContract;
  rows?: readonly PortableRowEnvelopeContract[];
}>;

const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const stringValue = (value: unknown) => (value == null ? "" : String(value).trim());
const required = (value: string, name: string) => {
  if (!value) throw new Error(`ERP851_MAPPING_REQUIRED:${name}`);
  return value;
};
const packageIdFromSha = (
  sourceSha: string,
  organizationId: string,
  mapping: Erp851ReviewedAccountMapping | undefined,
) => {
  const hex = sha256(
    `${sourceSha}:${organizationId}:portable-data-package-v1:converter-${ERP851_CONVERTER_VERSION}:${canonicalJson((mapping ?? { mode: "safe" }) as never)}`,
  ).slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
};
const normalizeZipTimestamps = (input: Buffer) => {
  const output = Buffer.from(input);
  let eocd = -1;
  for (let offset = output.length - 22; offset >= Math.max(0, output.length - 65_557); offset -= 1)
    if (output.readUInt32LE(offset) === 0x06054b50) {
      eocd = offset;
      break;
    }
  if (eocd < 0) throw new Error("ERP851_OUTPUT_INVALID_XLSX");
  const entryCount = output.readUInt16LE(eocd + 10);
  let centralOffset = output.readUInt32LE(eocd + 16);
  for (let entry = 0; entry < entryCount; entry += 1) {
    const localOffset = output.readUInt32LE(centralOffset + 42);
    for (const offset of [centralOffset + 12, localOffset + 10]) {
      output.writeUInt16LE(0, offset);
      output.writeUInt16LE(0x21, offset + 2);
    }
    centralOffset +=
      46 +
      output.readUInt16LE(centralOffset + 28) +
      output.readUInt16LE(centralOffset + 30) +
      output.readUInt16LE(centralOffset + 32);
  }
  return output;
};

const loadInspectionTables = async (path: string) => {
  const tables = new Map<string, SourceTable>();
  for (const line of (await readFile(path, "utf8")).split(/\r?\n/)) {
    if (!line.includes('"kind":"table"')) continue;
    const item = JSON.parse(line) as { kind: string; sheet?: string; values?: unknown[][] };
    if (item.kind === "table" && item.sheet && item.values)
      tables.set(item.sheet, { values: item.values });
  }
  return tables;
};

const records = (tables: ReadonlyMap<string, SourceTable>, sheetName: string): SourceRecord[] => {
  const table = tables.get(sheetName);
  if (!table?.values.length) throw new Error(`ERP851_SOURCE_SHEET_MISSING:${sheetName}`);
  const headers = table.values[0]!.map(stringValue);
  return table.values
    .slice(1)
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? null])));
};

const externalReference = (externalId: string) =>
  [{ system: "erp851-staging", externalId }] as const;
const createRow = (
  rowNumber: number,
  sourceId: string,
  data: PortableRowEnvelopeContract["data"],
  relationships: PortableRowEnvelopeContract["relationships"] = {},
): PortableRowEnvelopeContract => ({
  rowNumber,
  operation: "create",
  externalReferences: externalReference(sourceId),
  relationships,
  data,
});
const column = (
  key: string,
  type: "string" | "integer" | "boolean" | "date" | "timestamp" | "json" = "string",
  requiredColumn = false,
) => ({ key, header: key, type, required: requiredColumn, editable: true });
const schema = (
  resourceType: string,
  sheetName: string,
  columns: PortableSheetSchemaContract["columns"],
): PortableSheetSchemaContract => ({
  resourceType,
  sheetName,
  schemaVersion: 1,
  stableIdColumn: "stableId",
  operationColumn: "operation",
  columns,
});
const json = (value: unknown) => JSON.stringify(value);
const integer = (value: unknown) => stringValue(value || 0);
const expenseClass = (categoryValue: unknown) => {
  const category = stringValue(categoryValue).toLocaleLowerCase("vi");
  if (category.includes("lương") || category.includes("thưởng")) return "payroll_personnel";
  if (category.includes("phí ngân hàng")) return "bank_fee";
  if (category.includes("thuế")) return "tax_payment";
  return "non_documented";
};

export async function convertErp851StagingWorkbook(
  input: Erp851ConverterInput,
): Promise<Erp851ConversionResult> {
  const source = await readFile(input.sourceWorkbookPath);
  const sourceWorkbookSha256 = sha256(source);
  if (sourceWorkbookSha256 !== ERP851_STAGING_SHA256)
    throw new Error(`ERP851_SOURCE_SHA_MISMATCH:${sourceWorkbookSha256}`);
  const inspectionPath = input.sourceInspectionPath ?? `${input.sourceWorkbookPath}.inspect.ndjson`;
  const tables = await loadInspectionTables(inspectionPath);
  const parties = records(tables, "02_Parties");
  const projects = records(tables, "04_Projects");
  const purchaseHeaders = records(tables, "05_Purchase_Invoices");
  const purchaseLines = records(tables, "06_Purchase_Lines");
  const revenue = records(tables, "07_Revenue_Activities");
  const expenses = records(tables, "08_Expenses");
  const review = records(tables, "09_Review_Queue");
  const brokenHeaders = purchaseHeaders.filter(
    (row) => stringValue(row.management_state) === "source_exception_excluded",
  );
  const importablePurchaseHeaders = purchaseHeaders.filter(
    (row) =>
      stringValue(row.management_state) !== "source_exception_excluded" &&
      Boolean(stringValue(row.document_number)) &&
      /^\d{4}-\d{2}-\d{2}$/.test(stringValue(row.document_date)) &&
      BigInt(integer(row.gross_minor)) > 0n,
  );
  const incompletePurchaseHeaders = purchaseHeaders.filter(
    (row) =>
      stringValue(row.management_state) !== "source_exception_excluded" &&
      (!stringValue(row.document_number) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(stringValue(row.document_date)) ||
        BigInt(integer(row.gross_minor)) <= 0n),
  );
  const sourceExceptions = review.filter(
    (row) => stringValue(row.status) === "source_exception_excluded",
  );
  if (brokenHeaders.length !== 2 || sourceExceptions.length !== 9)
    throw new Error(
      `ERP851_SOURCE_CONTROL_MISMATCH:broken=${brokenHeaders.length}:exceptions=${sourceExceptions.length}`,
    );

  const partyRows = parties.map((row, index) =>
    createRow(index + 2, stringValue(row.party_id), {
      id: stringValue(row.party_id),
      display_name: stringValue(row.display_name),
      normalized_tax_id: stringValue(row.tax_id) || null,
      status: "active",
    }),
  );
  const projectRows = projects.map((row, index) => {
    const stableId = stringValue(row.project_id);
    const clientPartyId = stringValue(row.customer_party_id) || "party-naai-studio";
    return createRow(
      index + 2,
      stableId,
      {
        id: stableId,
        code: stableId.replace(/^project-/, "").slice(0, 48),
        name: stringValue(row.project_name),
        client_party_id: clientPartyId || null,
        owner_user_id: "local-owner-actor",
        contract_type: "fixed_fee",
        currency: "VND",
        budget_minor: integer(row.contract_value_minor),
        starts_on: stringValue(row.starts_on) || null,
        ends_on: stringValue(row.ends_on) || null,
        state: "active",
      },
      { client_party_id: clientPartyId || null },
    );
  });

  const resources: Resource[] = [
    {
      inventory: {
        resourceType: "parties",
        sheetName: "parties",
        excluded: false,
        schemaVersion: 1,
        dependencyOrder: 10,
        mutability: "editable",
      },
      schema: schema("parties", "parties", [
        column("id", "string", true),
        column("display_name", "string", true),
        column("normalized_tax_id"),
        column("status", "string", true),
      ]),
      rows: partyRows,
    },
    {
      inventory: {
        resourceType: "projects",
        sheetName: "projects",
        excluded: false,
        schemaVersion: 1,
        dependencyOrder: 20,
        mutability: "editable",
      },
      schema: schema("projects", "projects", [
        column("id", "string", true),
        column("code", "string", true),
        column("name", "string", true),
        column("client_party_id"),
        column("owner_user_id"),
        column("contract_type"),
        column("currency", "string", true),
        column("budget_minor", "integer"),
        column("starts_on", "date"),
        column("ends_on", "date"),
        column("state", "string", true),
      ]),
      rows: projectRows,
    },
  ];

  if (input.reviewedAccountMapping) {
    const mapping = input.reviewedAccountMapping;
    const lineGroups = new Map<string, SourceRecord[]>();
    for (const line of purchaseLines) {
      const key = stringValue(line.invoice_id);
      lineGroups.set(key, [...(lineGroups.get(key) ?? []), line]);
    }
    const invoiceReferenceCounts = new Map<string, number>();
    const invoiceRows = importablePurchaseHeaders.map((row, index) => {
      const stableId = stringValue(row.invoice_id);
      const originalDocumentNumber = stringValue(row.document_number);
      const partyId = stringValue(row.supplier_party_id);
      const referenceKey = `${partyId}\u0000${originalDocumentNumber}`;
      const referenceOccurrence = (invoiceReferenceCounts.get(referenceKey) ?? 0) + 1;
      invoiceReferenceCounts.set(referenceKey, referenceOccurrence);
      const documentNumber =
        referenceOccurrence === 1
          ? originalDocumentNumber
          : `${originalDocumentNumber} / ${stableId}`;
      const sourceLines = (lineGroups.get(stableId) ?? []).filter(
        (line) => BigInt(integer(line.net_minor)) > 0n,
      );
      const sourceTotals = sourceLines.reduce<{ net: bigint; tax: bigint; gross: bigint }>(
        (totals, line) => ({
          net: totals.net + BigInt(integer(line.net_minor)),
          tax: totals.tax + BigInt(integer(line.tax_minor)),
          gross: totals.gross + BigInt(integer(line.gross_minor)),
        }),
        { net: 0n, tax: 0n, gross: 0n },
      );
      const headerTotals = {
        net: BigInt(integer(row.net_minor)),
        tax: BigInt(integer(row.tax_minor)),
        gross: BigInt(integer(row.gross_minor)),
      };
      const exactSourceLines =
        sourceLines.length > 0 &&
        sourceTotals.net === headerTotals.net &&
        sourceTotals.tax === headerTotals.tax &&
        sourceTotals.gross === headerTotals.gross;
      const normalizedLines: SourceRecord[] = exactSourceLines
        ? sourceLines
        : [
            {
              line_number: 1,
              description: "Imported invoice summary; source lines retained in ERP-851 staging",
              quantity: 1,
              source_unit_price_raw: headerTotals.net.toString(),
              net_minor: headerTotals.net.toString(),
              tax_minor: headerTotals.tax.toString(),
              gross_minor: headerTotals.gross.toString(),
            },
          ];
      const lines = normalizedLines.map((line) => ({
        originalLineNumber: Number(line.line_number),
        description: stringValue(line.description) || "Imported purchase line",
        quantity: stringValue(line.quantity) || "1",
        unitPriceMinor: integer(line.source_unit_price_raw ?? line.net_minor),
        netMinor: integer(line.net_minor),
        taxMinor: integer(line.tax_minor),
        grossMinor: integer(line.gross_minor),
        primaryAccountCode: required(
          mapping.purchasePrimaryAccountCode,
          "purchasePrimaryAccountCode",
        ),
        ...(BigInt(integer(line.tax_minor)) > 0n && mapping.purchaseTaxAccountCode
          ? { taxAccountCode: mapping.purchaseTaxAccountCode }
          : {}),
        allocations: [
          {
            id: `${stableId}-line-${stringValue(line.line_number)}-allocation`,
            amountMinor: integer(line.net_minor),
            dimensions: { taxState: "unreviewed", source: "erp851-staging" },
          },
        ],
      }));
      return createRow(
        index + 2,
        stableId,
        {
          id: stableId,
          type: "purchase_invoice",
          document_number: documentNumber,
          fiscal_year: String(stringValue(row.document_date).slice(0, 4)),
          document_date: stringValue(row.document_date),
          due_date: stringValue(row.document_date),
          currency: stringValue(row.currency) || "VND",
          net_minor: integer(row.net_minor),
          tax_minor: integer(row.tax_minor),
          gross_minor: integer(row.gross_minor),
          control_account_code: required(
            mapping.purchaseControlAccountCode,
            "purchaseControlAccountCode",
          ),
          lines: json(lines),
        },
        { party_id: partyId },
      );
    });
    const importableExpenses = expenses.filter(
      (row) =>
        BigInt(integer(row.gross_minor)) > 0n &&
        (stringValue(row.funding_classification) !== "unknown_funding" ||
          Boolean(mapping.expenseUnknownCounterAccountCode)),
    );
    const expenseRows = importableExpenses.map((row, index) => {
      const stableId = stringValue(row.expense_id);
      const fundingClassification = stringValue(row.funding_classification);
      const counterAccountCode =
        fundingClassification === "owner_paid_company_expense"
          ? mapping.expenseOwnerCounterAccountCode
          : fundingClassification === "company_account"
            ? mapping.expenseCompanyCounterAccountCode
            : mapping.expenseUnknownCounterAccountCode;
      const line = {
        description: stringValue(row.category) || "Imported expense",
        netMinor: integer(row.net_minor),
        vatMinor: integer(row.vat_minor),
        grossMinor: integer(row.gross_minor),
        postingAccountCode: required(
          mapping.expensePostingAccountCode,
          "expensePostingAccountCode",
        ),
        ...(mapping.expenseVatAccountCode ? { vatAccountCode: mapping.expenseVatAccountCode } : {}),
        managementState: "unreviewed",
        citState: "unreviewed",
        vatState: "unreviewed",
        allocations: [
          {
            id: `${stableId}-allocation`,
            amountMinor: integer(row.net_minor),
            dimensions: {
              source: "erp851-staging",
              fundingClassification: fundingClassification || "unknown_funding",
            },
          },
        ],
      };
      return createRow(index + 2, stableId, {
        id: stableId,
        expense_class: expenseClass(row.category),
        expense_date: stringValue(row.expense_date),
        business_purpose: stringValue(row.category) || "Imported company expense",
        currency: "VND",
        net_minor: integer(row.net_minor),
        vat_minor: integer(row.vat_minor),
        gross_minor: integer(row.gross_minor),
        counter_account_code: required(counterAccountCode ?? "", "expenseCounterAccountCode"),
        evidence_checklist: json({
          sourceWorkbook: true,
          externalFileReference: Boolean(row.evidence_url),
        }),
        lines: json([line]),
      });
    });
    resources.push(
      {
        inventory: {
          resourceType: "commercial_documents",
          sheetName: "purchase_invoices",
          excluded: false,
          schemaVersion: 1,
          dependencyOrder: 30,
          mutability: "editable",
        },
        schema: schema("commercial_documents", "purchase_invoices", [
          column("id", "string", true),
          column("type", "string", true),
          column("document_number", "string", true),
          column("fiscal_year", "integer", true),
          column("document_date", "date", true),
          column("due_date", "date", true),
          column("currency", "string", true),
          column("net_minor", "integer", true),
          column("tax_minor", "integer", true),
          column("gross_minor", "integer", true),
          column("control_account_code", "string", true),
          column("lines", "json", true),
        ]),
        rows: invoiceRows,
      },
      {
        inventory: {
          resourceType: "expenses",
          sheetName: "expenses",
          excluded: false,
          schemaVersion: 1,
          dependencyOrder: 40,
          mutability: "editable",
        },
        schema: schema("expenses", "expenses", [
          column("id", "string", true),
          column("expense_class", "string", true),
          column("expense_date", "date", true),
          column("business_purpose", "string", true),
          column("currency", "string", true),
          column("net_minor", "integer", true),
          column("vat_minor", "integer", true),
          column("gross_minor", "integer", true),
          column("counter_account_code", "string", true),
          column("evidence_checklist", "json"),
          column("lines", "json", true),
        ]),
        rows: expenseRows,
      },
    );
  } else {
    resources.push(
      {
        inventory: {
          resourceType: "commercial_documents",
          excluded: true,
          exclusionReason:
            "125 approved purchase invoices retained outside the import package until reviewed AP, expense and VAT account mappings are supplied; 2 broken headers remain excluded",
          schemaVersion: 1,
          dependencyOrder: 30,
          mutability: "editable",
        },
      },
      {
        inventory: {
          resourceType: "expenses",
          excluded: true,
          exclusionReason:
            "127 management expenses retained outside the import package until reviewed funding counter-account and expense account mappings are supplied",
          schemaVersion: 1,
          dependencyOrder: 40,
          mutability: "editable",
        },
      },
    );
  }
  resources.push(
    {
      inventory: {
        resourceType: "revenue_activities_source_inventory",
        excluded: true,
        exclusionReason: `${revenue.length} revenue/receipt activities are not safely representable as one canonical resource without issued-invoice, recognition and receipt classification`,
        schemaVersion: 1,
        dependencyOrder: 50,
        mutability: "read_only",
      },
    },
    {
      inventory: {
        resourceType: "erp851_source_exceptions",
        excluded: true,
        exclusionReason: `Explicitly excludes ${brokenHeaders.length} broken purchase headers, ${incompletePurchaseHeaders.length} incomplete purchase headers and ${sourceExceptions.length} source-exception review items`,
        schemaVersion: 1,
        dependencyOrder: 60,
        mutability: "read_only",
      },
    },
  );

  const inventory: PortableSheetInventoryContract[] = resources.map((resource) =>
    resource.inventory.excluded
      ? { ...resource.inventory, rowCount: 0 }
      : {
          ...resource.inventory,
          headerCount: 5 + resource.schema!.columns.length,
          rowCount: resource.rows!.length,
          sha256: hashPortableRows(resource.rows! as never),
        },
  );
  const schemas = resources.flatMap((resource) => (resource.schema ? [resource.schema] : []));
  const packageId = packageIdFromSha(
    sourceWorkbookSha256,
    input.organizationId,
    input.reviewedAccountMapping,
  );
  const exportedAt = "2026-08-08T00:00:00.000Z";
  const asOf = input.asOf ?? "2026-08-08";
  const manifestPayload = {
    schemaVersion: PORTABLE_DATA_PACKAGE_SCHEMA_VERSION,
    packageId,
    organizationId: input.organizationId,
    exportedAt,
    asOf,
    exportedBy: "erp851-staging-converter",
    sourceSystem: "naai-erp" as const,
    sourceApiVersion: "v1" as const,
    hashAlgorithm: PORTABLE_DATA_PACKAGE_HASH_ALGORITHM,
    sheets: inventory,
    schemas,
    totalSheetCount: inventory.filter((item) => !item.excluded).length,
    totalRowCount: inventory.reduce((sum, item) => sum + item.rowCount, 0),
  };
  const packageHash = sha256(canonicalJson(manifestPayload as never));
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "NAAI ERP ERP-851 converter";
  workbook.created = new Date("1980-01-01T00:00:00.000Z");
  workbook.modified = workbook.created;
  const manifestSheet = workbook.addWorksheet("_manifest");
  for (const row of [
    ["schema_version", PORTABLE_DATA_PACKAGE_SCHEMA_VERSION],
    ["package_id", packageId],
    ["organization_id", input.organizationId],
    ["as_of", asOf],
    ["exported_at", exportedAt],
    ["exported_by", "erp851-staging-converter"],
    ["package_hash", packageHash],
    [],
    [
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
    ],
  ])
    manifestSheet.addRow(row);
  for (const item of inventory)
    manifestSheet.addRow([
      item.resourceType,
      item.sheetName ?? null,
      item.excluded,
      item.exclusionReason ?? null,
      item.schemaVersion,
      item.dependencyOrder,
      item.mutability,
      item.headerCount ?? null,
      item.rowCount,
      item.sha256 ?? null,
    ]);
  const schemaSheet = workbook.addWorksheet("_schemas");
  schemaSheet.state = "veryHidden";
  schemaSheet.addRow(["resource_type", "schema_json"]);
  for (const item of schemas) schemaSheet.addRow([item.resourceType, JSON.stringify(item)]);
  for (const resource of resources.filter((item) => !item.inventory.excluded)) {
    const itemSchema = resource.schema!;
    const sheet = workbook.addWorksheet(itemSchema.sheetName);
    sheet.addRow([
      "operation",
      "stableId",
      "expectedResourceVersion",
      "externalReferences",
      "relationships",
      ...itemSchema.columns.map((item) => item.header),
    ]);
    for (const row of resource.rows!)
      sheet.addRow([
        row.operation,
        row.stableId ?? null,
        row.expectedResourceVersion ?? null,
        JSON.stringify(row.externalReferences),
        JSON.stringify(row.relationships),
        ...itemSchema.columns.map((item) => row.data[item.key] ?? null),
      ]);
  }
  const content = normalizeZipTimestamps(Buffer.from(await workbook.xlsx.writeBuffer()));
  const manifest: PortableDataPackageManifestContract = {
    ...manifestPayload,
    workbookSha256: sha256(content),
    packageHash,
  };
  const sum = (rows: readonly SourceRecord[], key: string) =>
    rows.reduce((total, row) => total + BigInt(integer(row[key])), 0n).toString();
  return {
    content,
    manifest,
    sourceWorkbookSha256,
    controls: {
      parties: parties.length,
      projects: projects.length,
      purchaseInvoices: importablePurchaseHeaders.length,
      expenses: expenses.length,
      expensesImportable: !input.reviewedAccountMapping
        ? expenses.length
        : expenses.filter(
            (row) =>
              BigInt(integer(row.gross_minor)) > 0n &&
              (stringValue(row.funding_classification) !== "unknown_funding" ||
                Boolean(input.reviewedAccountMapping?.expenseUnknownCounterAccountCode)),
          ).length,
      revenueActivitiesExcluded: revenue.length,
      brokenPurchaseHeadersExcluded: brokenHeaders.length,
      incompletePurchaseHeadersExcluded: incompletePurchaseHeaders.length,
      sourceExceptionsExcluded: sourceExceptions.length,
      purchaseGrossMinor: sum(importablePurchaseHeaders, "gross_minor"),
      expenseGrossMinor: sum(expenses, "gross_minor"),
    },
  };
}
