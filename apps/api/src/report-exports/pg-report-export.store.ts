import { createHash, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { FilteredDocumentExportQueryContract } from "@naai-erp/contracts";
import ExcelJS from "exceljs";
import {
  canonicalJson,
  createAccountantExportManifest,
  createAccountantWorkbook,
  createReportSnapshot,
  verifySnapshotReproduction,
  workbookSheetToCsv,
  type CanonicalJsonValue,
  type ReportSnapshot,
  type SnapshotMapping,
  type SnapshotUnresolvedItem,
  type WorkbookCell,
  type WorkbookSheet,
} from "@naai-erp/domain";
import pg from "pg";
import type { PoolClient } from "pg";
import {
  FINANCIAL_STATEMENT_STORE,
  type FinancialStatementStore,
  type StatementQuery,
} from "../financial-statements/financial-statement.types.js";
import type {
  ExportInput,
  ManagementWorkbookQuery,
  ReportExportContext,
  ReportKind,
  SnapshotInput,
} from "./report-export.types.js";
import { createAccountingListWorkbook } from "./accounting-list-workbook.js";
import {
  createManagementWorkbook,
  type ManagementExpenseCategoryRow,
  type ManagementExpenseRow,
  type ManagementMonthlyMetricRow,
  type ManagementPlanRow,
  type ManagementReceivableRow,
  type ManagementRevenueRow,
} from "./management-workbook.js";

type SnapshotRow = Record<string, unknown> & {
  id: string;
  version: number;
  organization_id: string;
  report_kind: ReportKind;
  period_starts_on: string;
  period_ends_on: string;
  dimensions: Record<string, string>;
  accounting_basis: string;
  framework: string | null;
  currency: string;
  canonical_request: Record<string, unknown>;
  canonical_result: Record<string, unknown>;
  formula_versions: Record<string, string>;
  mapping_versions: Record<string, string>;
  ledger_cutoff: Record<string, unknown>;
  source_manifest: readonly Record<string, unknown>[];
  readiness_summary: { mappings?: SnapshotMapping[] };
  unresolved_items: SnapshotUnresolvedItem[];
  previous_snapshot_id: string | null;
  previous_snapshot_version: number | null;
  captured_at: Date | string;
  captured_by: string;
};
type ExportRow = Record<string, unknown> & {
  id: string;
  version: number;
  snapshot_id: string;
  snapshot_version: number;
  format: "csv" | "xlsx";
  state: "generated" | "superseded";
  manifest: Record<string, unknown>;
  content: Buffer;
  content_hash: string;
  size_bytes: string;
  media_type: string;
  filename: string;
  generated_by: string;
  generated_at: Date | string;
};

const jsonSafe = (value: unknown): CanonicalJsonValue => {
  if (value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "number"
  )
    return value;
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, jsonSafe(v)]),
    );
  return String(value);
};
const hash = (value: unknown) =>
  createHash("sha256")
    .update(canonicalJson(jsonSafe(value)))
    .digest("hex");
const iso = (value: Date | string) => new Date(value).toISOString();
const isoDate = (value: Date | string) => String(value).slice(0, 10);
const cell = (value: unknown, format: WorkbookCell["format"] = "text"): WorkbookCell => ({
  value:
    value == null
      ? null
      : typeof value === "number" || typeof value === "boolean"
        ? value
        : String(value),
  format,
});
const normalizeZipTimestamps = (input: Buffer) => {
  const output = Buffer.from(input);
  let eocd = -1;
  for (let offset = output.length - 22; offset >= Math.max(0, output.length - 65_557); offset -= 1)
    if (output.readUInt32LE(offset) === 0x06054b50) {
      eocd = offset;
      break;
    }
  if (eocd < 0) throw new Error("Generated XLSX ZIP directory is invalid");
  const entryCount = output.readUInt16LE(eocd + 10);
  let centralOffset = output.readUInt32LE(eocd + 16);
  for (let entry = 0; entry < entryCount; entry += 1) {
    if (output.readUInt32LE(centralOffset) !== 0x02014b50)
      throw new Error("Generated XLSX ZIP entry is invalid");
    const localOffset = output.readUInt32LE(centralOffset + 42);
    if (output.readUInt32LE(localOffset) !== 0x04034b50)
      throw new Error("Generated XLSX ZIP local entry is invalid");
    for (const timestampOffset of [centralOffset + 12, localOffset + 10]) {
      output.writeUInt16LE(0, timestampOffset);
      output.writeUInt16LE(0x21, timestampOffset + 2);
    }
    centralOffset +=
      46 +
      output.readUInt16LE(centralOffset + 28) +
      output.readUInt16LE(centralOffset + 30) +
      output.readUInt16LE(centralOffset + 32);
  }
  return output;
};

@Injectable()
export class PgReportExportStore {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  constructor(
    @Inject(FINANCIAL_STATEMENT_STORE) private readonly reports: FinancialStatementStore,
  ) {}

  async listSnapshots(c: ReportExportContext): Promise<unknown> {
    const r = await this.pool.query(
      `select *,period_starts_on::text period_starts_on,period_ends_on::text period_ends_on
       from report_snapshots where organization_id=$1 order by captured_at desc,id,version desc`,
      [c.organizationId],
    );
    return { items: r.rows.map((x) => this.snapshotContract(x as SnapshotRow)) };
  }
  async getSnapshot(c: ReportExportContext, id: string, version?: number): Promise<unknown> {
    const r = await this.pool.query(
      `select *,period_starts_on::text period_starts_on,period_ends_on::text period_ends_on
       from report_snapshots where organization_id=$1 and id=$2 and ($3::int is null or version=$3)
       order by version desc limit 1`,
      [c.organizationId, id, version ?? null],
    );
    if (!r.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
    return this.snapshotContract(r.rows[0] as SnapshotRow);
  }

  private query(input: SnapshotInput): StatementQuery {
    const raw = input.request;
    const endsOn = input.period.endsOn ?? input.period.asOfDate;
    const startsOn = input.period.startsOn;
    const at = String(raw.asOfInstant ?? `${input.period.asOfDate}T23:59:59.999Z`);
    return {
      ...(startsOn ? { startsOn } : {}),
      endsOn,
      asOfInstant: at,
      framework: (input.framework ?? raw.framework ?? "TT133") as "TT133" | "TT200",
      basis: (raw.basis ?? (input.accountingBasis.includes("cash") ? "cash" : "accrual")) as
        "accrual" | "cash",
      dimensions: input.dimensions ?? {},
    };
  }
  private async run(c: ReportExportContext, input: SnapshotInput) {
    const q = this.query(input);
    if (input.reportKind === "tax_expense_review")
      return jsonSafe(await this.reports.expenseExceptions(c, q, "all")) as Record<string, unknown>;
    const kind = input.reportKind === "direct_cash_flow" ? "cash_flow" : input.reportKind;
    return jsonSafe(await this.reports.report(c, kind, q)) as Record<string, unknown>;
  }
  private metadata(input: SnapshotInput, result: Record<string, unknown>) {
    const cutoff = (
      result.ledgerCutoff && typeof result.ledgerCutoff === "object"
        ? result.ledgerCutoff
        : undefined
    ) as Record<string, unknown> | undefined;
    const sourceFingerprint = String(
      cutoff?.sourceFingerprint ?? result.sourceFingerprint ?? hash(result),
    );
    const ledgerCutoff = {
      throughDate: String(cutoff?.throughDate ?? input.period.asOfDate),
      maxPostedAt: String(
        cutoff?.maxPostedAt ??
          input.request.asOfInstant ??
          `${input.period.asOfDate}T23:59:59.999Z`,
      ),
      journalCount: Number(cutoff?.journalCount ?? 0),
      lineCount: Number(cutoff?.lineCount ?? result.sourceLineCount ?? 0),
      sourceFingerprint,
    };
    const mapping = (result.mappingVersion ?? {}) as Record<string, unknown>;
    const mapId = mapping.id && mapping.version ? `${mapping.id}:${mapping.version}` : undefined;
    const unmapped = [
      ...new Set(
        [
          ...(Array.isArray(result.unmappedAccountIds) ? result.unmappedAccountIds : []),
          ...(Array.isArray(result.unmappedAccountCodes) ? result.unmappedAccountCodes : []),
        ].map(String),
      ),
    ].sort();
    const unclassified = (
      Array.isArray(result.unclassifiedJournalIds) ? result.unclassifiedJournalIds : []
    )
      .map(String)
      .sort();
    const unclassifiedRows = Array.isArray(result.unclassifiedRows)
      ? (result.unclassifiedRows as Record<string, unknown>[])
      : [];
    const unclassifiedAccounts = [
      ...new Set(
        unclassifiedRows.flatMap((row) =>
          Array.isArray(row.accountIds) ? row.accountIds.map(String) : [],
        ),
      ),
    ].sort();
    const mappings: SnapshotMapping[] = [
      ...(mapId
        ? [
            {
              sourceKey: "financial_statement_mapping",
              targetKey: input.reportKind,
              mappingVersionId: mapId,
              status: "mapped" as const,
            },
          ]
        : []),
      ...unmapped.map((sourceKey) => ({
        sourceKey,
        status: "unmapped" as const,
        reason: "No approved report mapping",
      })),
      ...unclassifiedAccounts.map((sourceKey) => ({
        sourceKey,
        status: "unmapped" as const,
        reason: "Underlying report classified this account as unresolved",
      })),
    ];
    const unresolved: SnapshotUnresolvedItem[] = [
      ...unmapped.map((source) => ({
        code: "UNMAPPED_ACCOUNT",
        severity: "critical" as const,
        sourceIds: [source],
        message: `Account ${source} is not mapped`,
      })),
      ...unclassified.map((source) => ({
        code: "UNCLASSIFIED_CASH_FLOW",
        severity: "critical" as const,
        sourceIds: [source],
        message: `Cash-flow journal ${source} is unclassified`,
      })),
      ...(Array.isArray(result.confidenceFlags)
        ? (result.confidenceFlags as Record<string, unknown>[]).map((flag) => ({
            code: String(flag.code ?? "REPORT_REVIEW_REQUIRED").toUpperCase(),
            severity: flag.severity === "warning" ? ("warning" as const) : ("critical" as const),
            sourceIds: Array.isArray(flag.sourceIds) ? flag.sourceIds.map(String) : [],
            message: String(flag.message ?? flag.code ?? "Underlying report requires review"),
          }))
        : []),
    ];
    if ((result.final === false || result.status === "review_required") && unresolved.length === 0)
      unresolved.push({
        code: "REPORT_REVIEW_REQUIRED",
        severity: "critical",
        sourceIds: [],
        message: "Underlying report controls require review",
      });
    const mappingVersions = { ...(mapId ? { financial_statement: mapId } : {}) };
    const sources = this.sourceManifest(result);
    return { ledgerCutoff, mappings, unresolved, mappingVersions, sources };
  }
  private sourceManifest(result: unknown) {
    const found = new Set<string>();
    const visit = (v: unknown, key = "") => {
      if (Array.isArray(v)) v.forEach((x) => visit(x, key));
      else if (v && typeof v === "object") Object.entries(v).forEach(([k, x]) => visit(x, k));
      else if (typeof v === "string" && /sourceid|journalid|expenseid|documentid/i.test(key))
        found.add(v);
    };
    visit(result);
    return [...found].sort().map((id) => ({ id }));
  }
  async createSnapshot(
    c: ReportExportContext,
    input: SnapshotInput,
    key: string,
  ): Promise<unknown> {
    const operation = `report-snapshot:create:${key}`;
    const requestBodyHash = hash(input);
    const settledReplay = await this.pool.query<{
      request_hash: string;
      response_body: Record<string, unknown>;
    }>(
      `select request_hash,response_body from api_idempotency_records
       where organization_id=$1 and idempotency_key=$2`,
      [c.organizationId, operation],
    );
    if (settledReplay.rows[0]) {
      if (settledReplay.rows[0].request_hash !== requestBodyHash)
        throw new Error("IDEMPOTENCY_CONFLICT");
      return { ...settledReplay.rows[0].response_body, idempotencyReplayed: true };
    }
    const result = await this.run(c, input),
      meta = this.metadata(input, result);
    const canonicalRequest = jsonSafe({
      ...input.request,
      reportKind: input.reportKind,
      period: input.period,
      dimensions: input.dimensions ?? {},
      accountingBasis: input.accountingBasis,
      framework: input.framework,
      formulaVersions: input.formulaVersions,
      mappingVersions: meta.mappingVersions,
    }) as Record<string, unknown>;
    const requestHash = hash(canonicalRequest),
      resultHash = hash(result);
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `${c.organizationId}:${operation}`,
      ]);
      const replay = await client.query<{
        request_hash: string;
        response_body: Record<string, unknown>;
      }>(
        `select request_hash,response_body from api_idempotency_records where organization_id=$1 and idempotency_key=$2 for update`,
        [c.organizationId, operation],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_hash !== requestBodyHash)
          throw new Error("IDEMPOTENCY_CONFLICT");
        await client.query("rollback");
        return { ...replay.rows[0].response_body, idempotencyReplayed: true };
      }
      const existing = await client.query(
        `select *,period_starts_on::text period_starts_on,period_ends_on::text period_ends_on
         from report_snapshots where organization_id=$1 and report_kind=$2 and request_hash=$3 and source_fingerprint=$4`,
        [c.organizationId, input.reportKind, requestHash, meta.ledgerCutoff.sourceFingerprint],
      );
      let row: SnapshotRow;
      if (existing.rows[0]) row = existing.rows[0] as SnapshotRow;
      else {
        const id = String(input.request.snapshotId ?? randomUUID());
        const previous = await client.query<{ id: string; version: number }>(
          `select id,version from report_snapshots where organization_id=$1 and id=$2 order by version desc limit 1`,
          [c.organizationId, id],
        );
        const version = (previous.rows[0]?.version ?? 0) + 1;
        const readiness =
          meta.mappings.every((x) => x.status === "mapped") && meta.unresolved.length === 0
            ? "final"
            : "review_required";
        const inserted = await client.query(
          `insert into report_snapshots(organization_id,id,version,previous_snapshot_id,previous_snapshot_version,report_kind,readiness,period_starts_on,period_ends_on,dimensions,accounting_basis,framework,currency,canonical_request,request_hash,canonical_result,result_hash,formula_versions,mapping_versions,ledger_cutoff,source_manifest,source_fingerprint,readiness_summary,unresolved_items,captured_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,(select base_currency from organizations where id=$1),$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
           returning *,period_starts_on::text period_starts_on,period_ends_on::text period_ends_on`,
          [
            c.organizationId,
            id,
            version,
            previous.rows[0]?.id ?? null,
            previous.rows[0]?.version ?? null,
            input.reportKind,
            readiness,
            input.period.startsOn ?? input.period.asOfDate,
            input.period.endsOn ?? input.period.asOfDate,
            input.dimensions ?? {},
            input.accountingBasis,
            input.framework ?? null,
            canonicalRequest,
            requestHash,
            result,
            resultHash,
            input.formulaVersions,
            meta.mappingVersions,
            meta.ledgerCutoff,
            JSON.stringify(meta.sources),
            meta.ledgerCutoff.sourceFingerprint,
            {
              mappings: meta.mappings,
              mappedCount: meta.mappings.filter((x) => x.status === "mapped").length,
              unresolvedCount: meta.unresolved.length,
            },
            JSON.stringify(meta.unresolved),
            c.actorId,
          ],
        );
        row = inserted.rows[0] as SnapshotRow;
        await this.audit(client, c, "report_snapshot", id, version, "capture", null, {
          readiness,
          snapshotHash: this.snapshotContract(row).snapshotHash,
        });
      }
      const response = { ...this.snapshotContract(row), idempotencyReplayed: false };
      await client.query(
        `insert into api_idempotency_records(organization_id,idempotency_key,operation,request_hash,response_body) values($1,$2,'report-snapshot:create',$3,$4)`,
        [c.organizationId, operation, requestBodyHash, response],
      );
      await client.query("commit");
      return response;
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
  }
  async reproduceSnapshot(c: ReportExportContext, id: string, version: number): Promise<unknown> {
    const raw = await this.rawSnapshot(c, id, version),
      snapshot = this.snapshotContract(raw);
    const request = raw.canonical_request;
    const input = {
      reportKind: raw.report_kind,
      period: {
        startsOn: isoDate(raw.period_starts_on),
        endsOn: isoDate(raw.period_ends_on),
        asOfDate: isoDate(raw.period_ends_on),
      },
      dimensions: raw.dimensions,
      accountingBasis: raw.accounting_basis,
      ...(raw.framework ? { framework: raw.framework } : {}),
      formulaVersions: raw.formula_versions,
      request,
    } as SnapshotInput;
    const result = await this.run(c, input);
    return verifySnapshotReproduction(snapshot, jsonSafe(request), jsonSafe(result));
  }

  async listExports(c: ReportExportContext): Promise<unknown> {
    const r = await this.pool.query(
      `select * from accountant_exports where organization_id=$1 order by generated_at desc,id,version desc`,
      [c.organizationId],
    );
    return { items: await Promise.all(r.rows.map((x) => this.exportContract(c, x as ExportRow))) };
  }
  async getExport(c: ReportExportContext, id: string, version?: number): Promise<unknown> {
    const r = await this.pool.query(
      `select * from accountant_exports where organization_id=$1 and id=$2 and ($3::int is null or version=$3) order by version desc limit 1`,
      [c.organizationId, id, version ?? null],
    );
    if (!r.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
    return this.exportContract(c, r.rows[0] as ExportRow);
  }
  async createExport(c: ReportExportContext, input: ExportInput, key: string): Promise<unknown> {
    const snapshotRaw = await this.rawSnapshot(c, input.snapshotId, input.snapshotVersion);
    if (snapshotRaw.report_kind !== input.reportKind) throw new Error("VALIDATION_FAILED");
    const snapshot = this.snapshotContract(snapshotRaw),
      workbook = await this.workbook(c, snapshot),
      manifest = createAccountantExportManifest(workbook, input.format);
    const rendered =
      input.format === "csv"
        ? Buffer.from(this.csv(workbook.sheets), "utf8")
        : await this.xlsx(workbook);
    const contentHash = createHash("sha256").update(rendered).digest("hex"),
      operation = `accountant-export:create:${key}`,
      requestHash = hash(input);
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `${c.organizationId}:${operation}`,
      ]);
      const replay = await client.query<{
        request_hash: string;
        response_body: Record<string, unknown>;
      }>(
        `select request_hash,response_body from api_idempotency_records where organization_id=$1 and idempotency_key=$2 for update`,
        [c.organizationId, operation],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_hash !== requestHash) throw new Error("IDEMPOTENCY_CONFLICT");
        await client.query("rollback");
        return { ...replay.rows[0].response_body, idempotencyReplayed: true };
      }
      const duplicate = await client.query(
        `select * from accountant_exports where organization_id=$1 and snapshot_id=$2 and snapshot_version=$3 and format=$4 and content_hash=$5`,
        [c.organizationId, input.snapshotId, input.snapshotVersion, input.format, contentHash],
      );
      let row: ExportRow;
      if (duplicate.rows[0]) row = duplicate.rows[0] as ExportRow;
      else {
        const id = randomUUID(),
          filename = `${input.reportKind}-${snapshot.period.asOfDate}-v${snapshot.version}.${input.format}`,
          media =
            input.format === "csv"
              ? "text/csv; charset=utf-8"
              : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        const inserted = await client.query(
          `insert into accountant_exports(organization_id,id,version,snapshot_id,snapshot_version,format,label,manifest,content,content_hash,size_bytes,media_type,filename,generated_by) values($1,$2,1,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning *`,
          [
            c.organizationId,
            id,
            input.snapshotId,
            input.snapshotVersion,
            input.format,
            `${input.reportKind} ${snapshot.period.asOfDate}`,
            manifest,
            rendered,
            contentHash,
            rendered.length,
            media,
            filename,
            c.actorId,
          ],
        );
        row = inserted.rows[0] as ExportRow;
        await this.audit(client, c, "accountant_export", id, 1, "generate", null, {
          snapshotId: input.snapshotId,
          snapshotVersion: input.snapshotVersion,
          contentHash,
          workbookHash: manifest.workbookHash,
          isFinal: manifest.isFinal,
        });
      }
      const response = { ...(await this.exportContract(c, row)), idempotencyReplayed: false };
      await client.query(
        `insert into api_idempotency_records(organization_id,idempotency_key,operation,request_hash,response_body) values($1,$2,'accountant-export:create',$3,$4)`,
        [c.organizationId, operation, requestHash, response],
      );
      await client.query("commit");
      return response;
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
  }
  async downloadExport(c: ReportExportContext, id: string, version: number) {
    const r = await this.pool.query<ExportRow>(
      `select * from accountant_exports where organization_id=$1 and id=$2 and version=$3`,
      [c.organizationId, id, version],
    );
    if (!r.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
    return {
      content: r.rows[0].content,
      mediaType: r.rows[0].media_type,
      filename: r.rows[0].filename,
    };
  }
  async exportSalesInvoices(c: ReportExportContext, filters: FilteredDocumentExportQueryContract) {
    const rows =
      filters.invoicePresence === "missing"
        ? []
        : (
            await this.pool.query(
              `select d.id,d.type::text "sourceType",'present'::text "invoicePresence",d.state::text state,d.document_number "documentNumber",d.series,d.party_id "partyId",p.display_name "partyName",p.normalized_tax_id "partyTaxId",d.document_date::text "recordDate",d.due_date::text "dueDate",d.currency,d.net_minor::text "netMinor",d.tax_minor::text "taxMinor",d.gross_minor::text "grossMinor",d.control_account_code "accountCode",d.original_document_id "originalDocumentId",d.reason,d.journal_id "journalId",d.version::text version
       from commercial_documents d join parties p on p.organization_id=d.organization_id and p.id=d.party_id left join commercial_documents original on original.organization_id=d.organization_id and original.id=d.original_document_id
       where d.organization_id=$1 and d.document_date between $2::date and $3::date and (d.type='sales_invoice' or (d.type='credit_note' and original.type='sales_invoice')) and ($4::text is null or d.state::text=$4) and ($5::text is null or d.party_id=$5)
       and ($6::text is null or exists(select 1 from commercial_document_lines l left join commercial_document_allocations a on a.organization_id=l.organization_id and a.document_id=l.document_id and a.line_number=l.line_number where l.organization_id=d.organization_id and l.document_id=d.id and (l.dimensions->>'projectId'=$6 or a.dimensions->>'projectId'=$6))) order by d.document_date,d.id`,
              [
                c.organizationId,
                filters.startsOn,
                filters.endsOn,
                filters.state ?? null,
                filters.partyId ?? null,
                filters.projectId ?? null,
              ],
            )
          ).rows;
    const ids = rows.map((x) => String(x.id));
    const lines = ids.length
      ? (
          await this.pool.query(
            `select document_id "recordId",line_number::text "lineNumber",description,quantity::text quantity,unit_price_minor::text "unitPriceMinor",net_minor::text "netMinor",tax_minor::text "taxMinor",gross_minor::text "grossMinor",primary_account_code "accountCode",tax_code "taxCode",dimensions from commercial_document_lines where organization_id=$1 and document_id=any($2::text[]) order by document_id,line_number`,
            [c.organizationId, ids],
          )
        ).rows
      : [];
    return this.filteredWorkbook(c, "sales_invoices", filters, rows, lines);
  }
  async exportPurchaseInvoicesExpenses(
    c: ReportExportContext,
    filters: FilteredDocumentExportQueryContract,
  ) {
    const party = filters.payeePartyId ?? filters.partyId ?? null;
    const invoices =
      filters.invoicePresence === "missing"
        ? []
        : (
            await this.pool.query(
              `select d.id,'purchase_invoice'::text "sourceType",'present'::text "invoicePresence",d.state::text state,d.document_number "documentNumber",d.series,d.party_id "partyId",p.display_name "partyName",p.normalized_tax_id "partyTaxId",d.document_date::text "recordDate",d.due_date::text "dueDate",d.currency,d.net_minor::text "netMinor",d.tax_minor::text "taxMinor",d.gross_minor::text "grossMinor",d.control_account_code "accountCode",d.journal_id "journalId",d.version::text version from commercial_documents d join parties p on p.organization_id=d.organization_id and p.id=d.party_id where d.organization_id=$1 and d.type='purchase_invoice' and d.document_date between $2::date and $3::date and ($4::text is null or d.state::text=$4) and ($5::text is null or d.party_id=$5) and ($6::text is null or exists(select 1 from commercial_document_lines l left join commercial_document_allocations a on a.organization_id=l.organization_id and a.document_id=l.document_id and a.line_number=l.line_number where l.organization_id=d.organization_id and l.document_id=d.id and (l.dimensions->>'projectId'=$6 or a.dimensions->>'projectId'=$6))) order by d.document_date,d.id`,
              [
                c.organizationId,
                filters.startsOn,
                filters.endsOn,
                filters.state ?? null,
                party,
                filters.projectId ?? null,
              ],
            )
          ).rows;
    const expenses =
      filters.invoicePresence === "present"
        ? []
        : (
            await this.pool.query(
              `select e.id,'expense'::text "sourceType",'missing'::text "invoicePresence",e.state::text state,null::text "documentNumber",e.payee_party_id "partyId",p.display_name "partyName",p.normalized_tax_id "partyTaxId",e.expense_date::text "recordDate",null::text "dueDate",e.currency,e.net_minor::text "netMinor",e.vat_minor::text "taxMinor",e.gross_minor::text "grossMinor",e.counter_account_code "accountCode",e.journal_id "journalId",e.version::text version,e.expense_class::text "expenseClass",e.business_purpose "businessPurpose",e.cit_state::text "citState",e.vat_state::text "vatState" from expenses e left join parties p on p.organization_id=e.organization_id and p.id=e.payee_party_id where e.organization_id=$1 and e.expense_date between $2::date and $3::date and ($4::text is null or e.state::text=$4) and ($5::text is null or e.payee_party_id=$5) and ($6::text is null or exists(select 1 from expense_lines l left join expense_allocations a on a.organization_id=l.organization_id and a.expense_id=l.expense_id and a.line_number=l.line_number where l.organization_id=e.organization_id and l.expense_id=e.id and (l.dimensions->>'projectId'=$6 or a.dimensions->>'projectId'=$6))) order by e.expense_date,e.id`,
              [
                c.organizationId,
                filters.startsOn,
                filters.endsOn,
                filters.state ?? null,
                party,
                filters.projectId ?? null,
              ],
            )
          ).rows;
    const invoiceIds = invoices.map((x) => String(x.id));
    const expenseIds = expenses.map((x) => String(x.id));
    const [invoiceLines, expenseLines] = await Promise.all([
      invoiceIds.length
        ? this.pool
            .query(
              `select document_id "recordId",'purchase_invoice'::text "sourceType",line_number::text "lineNumber",description,net_minor::text "netMinor",tax_minor::text "taxMinor",gross_minor::text "grossMinor",primary_account_code "accountCode",dimensions from commercial_document_lines where organization_id=$1 and document_id=any($2::text[]) order by document_id,line_number`,
              [c.organizationId, invoiceIds],
            )
            .then((x) => x.rows)
        : [],
      expenseIds.length
        ? this.pool
            .query(
              `select expense_id "recordId",'expense'::text "sourceType",line_number::text "lineNumber",description,net_minor::text "netMinor",vat_minor::text "taxMinor",gross_minor::text "grossMinor",posting_account_code "accountCode",management_state::text "managementState",cit_state::text "citState",vat_state::text "vatState",cit_eligible_minor::text "citEligibleMinor",vat_eligible_minor::text "vatEligibleMinor",dimensions from expense_lines where organization_id=$1 and expense_id=any($2::text[]) order by expense_id,line_number`,
              [c.organizationId, expenseIds],
            )
            .then((x) => x.rows)
        : [],
    ]);
    return this.filteredWorkbook(
      c,
      "purchase_invoices_and_expenses",
      filters,
      [...invoices, ...expenses],
      [...invoiceLines, ...expenseLines],
    );
  }
  private async filteredWorkbook(
    c: ReportExportContext,
    kind: "sales_invoices" | "purchase_invoices_and_expenses",
    filters: FilteredDocumentExportQueryContract,
    records: Record<string, unknown>[],
    lines: Record<string, unknown>[],
  ) {
    const organization = await this.pool.query<{ legal_name: string }>(
      `select legal_name from organizations where id=$1`,
      [c.organizationId],
    );
    const book = createAccountingListWorkbook({
      kind,
      organizationId: c.organizationId,
      organizationName: organization.rows[0]?.legal_name ?? c.organizationId,
      filters,
      records,
      lines,
    });
    const content = normalizeZipTimestamps(Buffer.from(await book.xlsx.writeBuffer()));
    return {
      content,
      mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      filename: `${kind}-${filters.startsOn}-${filters.endsOn}.xlsx`,
      sha256: createHash("sha256").update(content).digest("hex"),
    };
  }
  async exportManagementWorkbook(c: ReportExportContext, filters: ManagementWorkbookQuery) {
    const params = [c.organizationId, filters.startsOn, filters.endsOn];
    const [
      organization,
      sales,
      recognition,
      receipts,
      receivables,
      purchases,
      directExpenses,
      ledgerMonths,
      targets,
      forecasts,
      categoryRows,
    ] = await Promise.all([
      this.pool.query<{ legal_name: string }>(`select legal_name from organizations where id=$1`, [
        c.organizationId,
      ]),
      this.pool.query(
        `select d.document_date::text date,'sales_invoice'::text "sourceType",
                  concat_ws('-',nullif(d.series,''),d.document_number) reference,
                  party.display_name "customerName",project.name "projectName",
                  contract.reference "contractReference",d.net_minor::text "invoicedMinor",d.tax_minor::text "taxMinor",
                  '0'::text "recognizedMinor",'0'::text "collectedMinor",d.state::text state
             from commercial_documents d
             join parties party on party.organization_id=d.organization_id and party.id=d.party_id
             left join lateral (
               select coalesce(a.dimensions->>'projectId',l.dimensions->>'projectId') project_id,
                      coalesce(a.dimensions->>'contractId',l.dimensions->>'contractId') contract_id
                 from commercial_document_lines l
                 left join commercial_document_allocations a on a.organization_id=l.organization_id and a.document_id=l.document_id and a.line_number=l.line_number
                where l.organization_id=d.organization_id and l.document_id=d.id
                  and coalesce(a.dimensions->>'projectId',l.dimensions->>'projectId') is not null
                order by l.line_number,a.allocation_number nulls first limit 1
             ) relation on true
             left join projects project on project.organization_id=d.organization_id and project.id=relation.project_id
             left join contracts contract on contract.organization_id=d.organization_id and contract.id=relation.contract_id
            where d.organization_id=$1 and d.type='sales_invoice'
              and d.state in ('issued','partially_paid','paid')
              and d.document_date between $2::date and $3::date
            order by d.document_date,d.id`,
        params,
      ),
      this.pool.query(
        `select event.effective_on::text date,'revenue_recognition'::text "sourceType",
                  event.id reference,party.display_name "customerName",project.name "projectName",
                  null::text "contractReference",'0'::text "invoicedMinor",
                  event.amount_minor::text "recognizedMinor",'0'::text "collectedMinor",event.state::text state
             from revenue_recognition_events event
             join projects project on project.organization_id=event.organization_id and project.id=event.project_id
             join parties party on party.organization_id=project.organization_id and party.id=project.client_party_id
            where event.organization_id=$1 and event.state='posted'
              and event.effective_on between $2::date and $3::date
            order by event.effective_on,event.id`,
        params,
      ),
      this.pool.query(
        `select bank.booking_date::text date,'customer_receipt'::text "sourceType",
                  bank.id reference,party.display_name "customerName",project.name "projectName",
                  contract.reference "contractReference",'0'::text "invoicedMinor",
                  '0'::text "recognizedMinor",allocation.target_amount_minor::text "collectedMinor",
                  attempt.state::text state
             from reconciliation_allocations allocation
             join reconciliation_attempts attempt on attempt.organization_id=allocation.organization_id and attempt.id=allocation.reconciliation_id and attempt.state='reconciled'
             join bank_transactions bank on bank.organization_id=attempt.organization_id and bank.id=attempt.bank_transaction_id
             join commercial_documents d on d.organization_id=allocation.organization_id and d.id=allocation.commercial_document_id and d.type='sales_invoice'
             join parties party on party.organization_id=d.organization_id and party.id=d.party_id
             left join lateral (
               select coalesce(a.dimensions->>'projectId',l.dimensions->>'projectId') project_id,
                      coalesce(a.dimensions->>'contractId',l.dimensions->>'contractId') contract_id
                 from commercial_document_lines l
                 left join commercial_document_allocations a on a.organization_id=l.organization_id and a.document_id=l.document_id and a.line_number=l.line_number
                where l.organization_id=d.organization_id and l.document_id=d.id
                order by l.line_number,a.allocation_number nulls first limit 1
             ) relation on true
             left join projects project on project.organization_id=d.organization_id and project.id=relation.project_id
             left join contracts contract on contract.organization_id=d.organization_id and contract.id=relation.contract_id
            where allocation.organization_id=$1 and allocation.target_type='commercial_document'
              and bank.booking_date between $2::date and $3::date
            order by bank.booking_date,allocation.id`,
        params,
      ),
      this.pool.query(
        `select party.display_name "customerName",d.document_number "documentNumber",
                  project.name "projectName",d.document_date::text "documentDate",d.due_date::text "dueDate",
                  d.gross_minor::text "grossMinor",coalesce(paid.amount_minor,0)::text "collectedMinor",
                  greatest(d.gross_minor-coalesce(paid.amount_minor,0),0)::text "outstandingMinor",
                  case when d.due_date>$3::date then 'Chưa đến hạn'
                       when $3::date-d.due_date<=30 then '1-30'
                       when $3::date-d.due_date<=60 then '31-60'
                       when $3::date-d.due_date<=90 then '61-90' else '>90' end "agingBucket",
                  d.state::text state
             from commercial_documents d
             join parties party on party.organization_id=d.organization_id and party.id=d.party_id
             left join lateral (
               select sum(a.target_amount_minor) amount_minor
                 from reconciliation_allocations a
                 join reconciliation_attempts r on r.organization_id=a.organization_id and r.id=a.reconciliation_id and r.state='reconciled'
                 join bank_transactions b on b.organization_id=r.organization_id and b.id=r.bank_transaction_id and b.booking_date<=$3::date
                where a.organization_id=d.organization_id and a.commercial_document_id=d.id
             ) paid on true
             left join lateral (
               select coalesce(a.dimensions->>'projectId',l.dimensions->>'projectId') project_id
                 from commercial_document_lines l left join commercial_document_allocations a on a.organization_id=l.organization_id and a.document_id=l.document_id and a.line_number=l.line_number
                where l.organization_id=d.organization_id and l.document_id=d.id order by l.line_number,a.allocation_number nulls first limit 1
             ) relation on true
             left join projects project on project.organization_id=d.organization_id and project.id=relation.project_id
            where d.organization_id=$1 and d.type='sales_invoice' and d.state in ('issued','partially_paid','paid')
              and d.document_date between $2::date and $3::date
              and d.gross_minor>coalesce(paid.amount_minor,0)
            order by d.due_date,d.id`,
        params,
      ),
      this.pool.query(
        `select d.document_date::text date,'purchase_invoice'::text "sourceType",
                  concat_ws('-',nullif(d.series,''),d.document_number) reference,party.display_name "supplierOrPayeeName",
                  project.name "projectName",coalesce(category.name,account.name,'Chưa phân loại') "categoryName",
                  coalesce(line.description,d.reason,'Hóa đơn mua vào') description,
                  d.net_minor::text "netMinor",d.tax_minor::text "taxMinor",d.gross_minor::text "grossMinor",
                  d.control_account_code "fundingSource",d.state::text state
             from commercial_documents d
             join parties party on party.organization_id=d.organization_id and party.id=d.party_id
             left join lateral (select * from commercial_document_lines l where l.organization_id=d.organization_id and l.document_id=d.id order by l.line_number limit 1) line on true
             left join lateral (select coalesce(a.dimensions->>'projectId',line.dimensions->>'projectId') project_id,coalesce(a.dimensions->>'category',line.dimensions->>'category') category_code from commercial_document_allocations a where a.organization_id=d.organization_id and a.document_id=d.id and a.line_number=line.line_number order by a.allocation_number limit 1) relation on true
             left join projects project on project.organization_id=d.organization_id and project.id=coalesce(relation.project_id,line.dimensions->>'projectId')
             left join expense_categories category on category.organization_id=d.organization_id and category.code=coalesce(relation.category_code,line.dimensions->>'category')
             left join accounts account on account.organization_id=d.organization_id and account.code=line.primary_account_code
            where d.organization_id=$1 and d.type='purchase_invoice' and d.state='posted'
              and d.document_date between $2::date and $3::date order by d.document_date,d.id`,
        params,
      ),
      this.pool.query(
        `select e.expense_date::text date,'expense'::text "sourceType",e.id reference,party.display_name "supplierOrPayeeName",
                  project.name "projectName",coalesce(category.name,account.name,e.expense_class::text) "categoryName",
                  e.business_purpose description,e.net_minor::text "netMinor",e.vat_minor::text "taxMinor",e.gross_minor::text "grossMinor",
                  e.counter_account_code "fundingSource",e.state::text state
             from expenses e left join parties party on party.organization_id=e.organization_id and party.id=e.payee_party_id
             left join lateral (select * from expense_lines l where l.organization_id=e.organization_id and l.expense_id=e.id order by l.line_number limit 1) line on true
             left join projects project on project.organization_id=e.organization_id and project.id=line.dimensions->>'projectId'
             left join expense_categories category on category.organization_id=e.organization_id and category.code=line.expense_category_code
             left join accounts account on account.organization_id=e.organization_id and account.code=line.posting_account_code
            where e.organization_id=$1 and e.state='posted' and e.expense_date between $2::date and $3::date
            order by e.expense_date,e.id`,
        params,
      ),
      this.pool.query(
        `select to_char(j.journal_date,'YYYY-MM') "month",
                  coalesce(sum(case when account.root_type='revenue' then coalesce(line.credit_minor,0)-coalesce(line.debit_minor,0) else 0 end),0)::text revenue_minor,
                  coalesce(sum(case when account.root_type='expense' then coalesce(line.debit_minor,0)-coalesce(line.credit_minor,0) else 0 end),0)::text expense_minor
             from journal_entries j join journal_lines line on line.organization_id=j.organization_id and line.journal_id=j.id
             join accounts account on account.organization_id=line.organization_id and account.code=line.account_code
            where j.organization_id=$1 and j.state='posted' and j.journal_date between $2::date and $3::date
            group by 1 order by 1`,
        params,
      ),
      this.pool.query(
        `select to_char(starts_on,'YYYY-MM') "month",amount_minor::text amount,state::text state
             from revenue_target_versions where organization_id=$1 and state='published'
              and team_id is null and service_line_code is null and owner_id is null
              and starts_on<=$3::date and ends_on>=$2::date order by starts_on,version_number desc`,
        params,
      ),
      this.pool.query(
        `with selected as (select * from forecast_versions where organization_id=$1 and state='published'
             and team_id is null and service_line_code is null and owner_id is null
             and starts_on<=$3::date and ends_on>=$2::date order by published_at desc nulls last,version_number desc limit 1)
           select to_char(component.scheduled_on,'YYYY-MM') "month",component.section::text section,
                  sum(case when component.direction='increase' then component.amount_minor else -component.amount_minor end)::text amount,
                  selected.state::text state
             from selected join forecast_components component on component.organization_id=selected.organization_id and component.forecast_version_id=selected.id
            where component.excluded=false and component.scheduled_on between $2::date and $3::date
            group by 1,2,4 order by 1,2`,
        params,
      ),
      this.pool.query(
        `select source.period_month "month",source.category_code "categoryCode",source.category_name "categoryName",sum(source.amount_minor)::text "amountMinor" from (
             select to_char(e.expense_date,'YYYY-MM') period_month,coalesce(line.expense_category_code,line.posting_account_code) category_code,coalesce(category.name,account.name,'Chưa phân loại') category_name,line.gross_minor amount_minor
               from expenses e join expense_lines line on line.organization_id=e.organization_id and line.expense_id=e.id
               left join expense_categories category on category.organization_id=line.organization_id and category.code=line.expense_category_code
               left join accounts account on account.organization_id=line.organization_id and account.code=line.posting_account_code
              where e.organization_id=$1 and e.state='posted' and e.expense_date between $2::date and $3::date
             union all
             select to_char(d.document_date,'YYYY-MM'),coalesce(line.dimensions->>'category',line.primary_account_code),coalesce(category.name,account.name,'Chưa phân loại'),line.gross_minor
               from commercial_documents d join commercial_document_lines line on line.organization_id=d.organization_id and line.document_id=d.id
               left join expense_categories category on category.organization_id=line.organization_id and category.code=line.dimensions->>'category'
               left join accounts account on account.organization_id=line.organization_id and account.code=line.primary_account_code
              where d.organization_id=$1 and d.type='purchase_invoice' and d.state='posted' and d.document_date between $2::date and $3::date
           ) source group by source.period_month,source.category_code,source.category_name order by source.period_month,source.category_name`,
        params,
      ),
    ]);

    const revenue = [
      ...sales.rows,
      ...recognition.rows,
      ...receipts.rows,
    ] as ManagementRevenueRow[];
    revenue.sort((a, b) => a.date.localeCompare(b.date) || a.reference.localeCompare(b.reference));
    const expenses = [...purchases.rows, ...directExpenses.rows] as ManagementExpenseRow[];
    expenses.sort((a, b) => a.date.localeCompare(b.date) || a.reference.localeCompare(b.reference));
    const months = new Map<string, ManagementMonthlyMetricRow>();
    const base = (month: string): ManagementMonthlyMetricRow => ({
      month,
      invoicedRevenueMinor: "0",
      recognizedRevenueMinor: "0",
      collectedRevenueMinor: "0",
      expenseMinor: "0",
      accountingProfitMinor: "0",
      receivableMinor: "0",
      outputVatMinor: "0",
      inputVatMinor: "0",
    });
    const add = (
      month: string,
      field: keyof Omit<ManagementMonthlyMetricRow, "month">,
      amount: string,
    ) => {
      const row = months.get(month) ?? base(month);
      months.set(month, { ...row, [field]: (BigInt(row[field]) + BigInt(amount)).toString() });
    };
    for (const row of sales.rows as (ManagementRevenueRow & { taxMinor?: string })[])
      add(row.date.slice(0, 7), "invoicedRevenueMinor", row.invoicedMinor);
    for (const row of recognition.rows as ManagementRevenueRow[])
      add(row.date.slice(0, 7), "recognizedRevenueMinor", row.recognizedMinor);
    for (const row of receipts.rows as ManagementRevenueRow[])
      add(row.date.slice(0, 7), "collectedRevenueMinor", row.collectedMinor);
    for (const row of purchases.rows as ManagementExpenseRow[]) {
      add(row.date.slice(0, 7), "inputVatMinor", row.taxMinor);
    }
    for (const row of directExpenses.rows as ManagementExpenseRow[])
      add(row.date.slice(0, 7), "inputVatMinor", row.taxMinor);
    for (const row of sales.rows as (ManagementRevenueRow & { taxMinor?: string })[])
      if (row.taxMinor) add(row.date.slice(0, 7), "outputVatMinor", row.taxMinor);
    for (const row of receivables.rows as ManagementReceivableRow[])
      add(row.documentDate.slice(0, 7), "receivableMinor", row.outstandingMinor);
    for (const row of ledgerMonths.rows as {
      month: string;
      revenue_minor: string;
      expense_minor: string;
    }[]) {
      add(row.month, "expenseMinor", row.expense_minor);
      add(
        row.month,
        "accountingProfitMinor",
        (BigInt(row.revenue_minor) - BigInt(row.expense_minor)).toString(),
      );
    }
    const targetByMonth = new Map(
      (targets.rows as { month: string; amount: string; state: string }[]).map((row) => [
        row.month,
        row,
      ]),
    );
    const forecastByMonth = new Map<
      string,
      { revenue: bigint; expense: bigint; cash: bigint; state: string }
    >();
    for (const row of forecasts.rows as {
      month: string;
      section: "revenue" | "expense" | "cash";
      amount: string;
      state: string;
    }[]) {
      const current = forecastByMonth.get(row.month) ?? {
        revenue: 0n,
        expense: 0n,
        cash: 0n,
        state: row.state,
      };
      current[row.section] += BigInt(row.amount);
      forecastByMonth.set(row.month, current);
    }
    const planMonths = [
      ...new Set([...targetByMonth.keys(), ...forecastByMonth.keys(), ...months.keys()]),
    ].sort();
    const plans: ManagementPlanRow[] = planMonths.map((month) => {
      const actual = months.get(month) ?? base(month),
        forecast = forecastByMonth.get(month);
      return {
        month,
        revenueTargetMinor: targetByMonth.get(month)?.amount ?? "0",
        forecastRevenueMinor: forecast?.revenue.toString() ?? "0",
        actualRevenueMinor: actual.recognizedRevenueMinor,
        forecastExpenseMinor: forecast?.expense.toString() ?? "0",
        actualExpenseMinor: actual.expenseMinor,
        state: targetByMonth.get(month)?.state ?? forecast?.state ?? "actual_only",
      };
    });
    const book = createManagementWorkbook({
      organizationId: c.organizationId,
      organizationName: organization.rows[0]?.legal_name ?? c.organizationId,
      startsOn: filters.startsOn,
      endsOn: filters.endsOn,
      asOfDate: filters.endsOn,
      revenue,
      receivables: receivables.rows as ManagementReceivableRow[],
      expenses,
      monthlyMetrics: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
      plans,
      expenseCategories: categoryRows.rows as ManagementExpenseCategoryRow[],
      controls: [
        {
          name: "Nguồn kế toán",
          value: "Chỉ posted/issued/reconciled",
          status: "pass",
          note: "Không dùng draft hoặc control workbook làm số liệu tài chính",
        },
        {
          name: "Tiền cuối kỳ theo tháng",
          value: "Chưa xuất",
          status: "unavailable",
          note: "Không đặt 0 giả định; cần canonical month-end cash read model",
        },
      ],
    });
    const content = normalizeZipTimestamps(Buffer.from(await book.xlsx.writeBuffer()));
    return {
      content,
      mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      filename: `management-workbook-${filters.startsOn}-${filters.endsOn}.xlsx`,
      sha256: createHash("sha256").update(content).digest("hex"),
    };
  }
  async supersedeExport(
    c: ReportExportContext,
    id: string,
    version: number,
    reason: string,
    key: string,
  ): Promise<unknown> {
    const operation = `accountant-export:supersede:${id}:${version}:${key}`,
      requestHash = hash({ id, version, reason });
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const replay = await client.query<{
        request_hash: string;
        response_body: Record<string, unknown>;
      }>(
        `select request_hash,response_body from api_idempotency_records where organization_id=$1 and idempotency_key=$2 for update`,
        [c.organizationId, operation],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_hash !== requestHash) throw new Error("IDEMPOTENCY_CONFLICT");
        await client.query("rollback");
        return { ...replay.rows[0].response_body, idempotencyReplayed: true };
      }
      const before = await client.query(
        `select state from accountant_exports where organization_id=$1 and id=$2 and version=$3 for update`,
        [c.organizationId, id, version],
      );
      if (!before.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
      if (before.rows[0].state !== "generated") throw new Error("INVALID_STATE_TRANSITION");
      const updated = await client.query(
        `update accountant_exports set state='superseded',superseded_by=$4,superseded_at=now(),supersede_reason=$5 where organization_id=$1 and id=$2 and version=$3 returning *`,
        [c.organizationId, id, version, c.actorId, reason.trim()],
      );
      await this.audit(
        client,
        c,
        "accountant_export",
        id,
        version,
        "supersede",
        { state: "generated" },
        { state: "superseded", reason: reason.trim() },
      );
      const response = {
        ...(await this.exportContract(c, updated.rows[0] as ExportRow)),
        idempotencyReplayed: false,
      };
      await client.query(
        `insert into api_idempotency_records(organization_id,idempotency_key,operation,request_hash,response_body) values($1,$2,'accountant-export:supersede',$3,$4)`,
        [c.organizationId, operation, requestHash, response],
      );
      await client.query("commit");
      return response;
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
  }

  private async rawSnapshot(c: ReportExportContext, id: string, version: number) {
    const r = await this.pool.query(
      `select *,period_starts_on::text period_starts_on,period_ends_on::text period_ends_on
       from report_snapshots where organization_id=$1 and id=$2 and version=$3`,
      [c.organizationId, id, version],
    );
    if (!r.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
    return r.rows[0] as SnapshotRow;
  }
  private snapshotContract(r: SnapshotRow): ReportSnapshot {
    return createReportSnapshot({
      id: r.id,
      version: Number(r.version),
      organizationId: r.organization_id,
      reportKind: r.report_kind,
      period: {
        startsOn: isoDate(r.period_starts_on),
        endsOn: isoDate(r.period_ends_on),
        asOfDate: isoDate(r.period_ends_on),
      },
      dimensions: r.dimensions,
      accountingBasis: r.accounting_basis,
      ...(r.framework ? { framework: r.framework } : {}),
      formulaVersions: r.formula_versions,
      mappingVersions: r.mapping_versions,
      ledgerCutoff: r.ledger_cutoff as never,
      sourceManifest: r.source_manifest as never,
      mappings: r.readiness_summary.mappings ?? [],
      unresolvedItems: r.unresolved_items,
      request: jsonSafe(r.canonical_request),
      result: jsonSafe(r.canonical_result),
      ...(r.previous_snapshot_id
        ? {
            previousSnapshotId: r.previous_snapshot_id,
            previousSnapshotVersion: Number(r.previous_snapshot_version),
          }
        : {}),
      createdAt: iso(r.captured_at),
      createdBy: r.captured_by,
    });
  }
  private async exportContract(c: ReportExportContext, r: ExportRow) {
    const snapshot = (await this.getSnapshot(
      c,
      r.snapshot_id,
      r.snapshot_version,
    )) as ReportSnapshot;
    return {
      schemaVersion: 1,
      id: r.id,
      version: Number(r.version),
      snapshotId: r.snapshot_id,
      snapshotVersion: Number(r.snapshot_version),
      snapshot,
      format: r.format,
      workbookHash: String(r.manifest.workbookHash),
      contentHash: r.content_hash,
      sizeBytes: String(r.size_bytes),
      mediaType: r.media_type,
      filename: r.filename,
      state: r.state,
      isFinal: Boolean(r.manifest.isFinal),
      createdAt: iso(r.generated_at),
      createdBy: r.generated_by,
      downloadUrl: `/api/v1/organizations/${encodeURIComponent(c.organizationId)}/accountant-exports/${encodeURIComponent(r.id)}/versions/${r.version}/download`,
    };
  }
  private async workbook(c: ReportExportContext, snapshot: ReportSnapshot) {
    const result = JSON.parse(snapshot.canonicalResultJson) as Record<string, unknown>;
    const summary: WorkbookSheet = {
      key: "summary",
      name: "Summary",
      columns: [
        { key: "field", label: "Field" },
        { key: "value", label: "Value" },
      ],
      rows: [
        ["Snapshot ID", snapshot.id],
        ["Version", snapshot.version],
        ["Report kind", snapshot.reportKind],
        ["Readiness", snapshot.readiness],
        ["As of date", snapshot.period.asOfDate],
        ["Result hash", snapshot.resultHash],
      ].map(([k, v]) => ({ field: cell(k), value: cell(v) })),
    };
    const reportRows: Record<string, WorkbookCell>[] = [];

    if (
      ["profit_and_loss", "balance_sheet", "direct_cash_flow", "vat_reconciliation"].includes(
        snapshot.reportKind,
      )
    ) {
      const lines = Array.isArray(result.rows)
        ? result.rows
        : Array.isArray(result.lines)
          ? result.lines
          : [];
      reportRows.push({ path: cell("Chỉ tiêu"), value: cell("Số tiền"), code: cell("Mã") });
      for (const line of lines as Record<string, unknown>[]) {
        reportRows.push({
          path: cell((line.label as string) ?? ""),
          value: cell((line.amountMinor as string) ?? ""),
          code: cell((line.lineCode as string) ?? ""),
        });
      }

      reportRows.push({ path: cell("---"), value: cell("---"), code: cell("---") });

      if (result.totalMinor !== undefined) {
        reportRows.push({
          path: cell("Tổng cộng"),
          value: cell(result.totalMinor as string),
          code: cell("TOTAL"),
        });
      }

      if (result.equation) {
        const eq = result.equation as Record<string, string | number | boolean>;
        reportRows.push({
          path: cell("Tổng Tài sản"),
          value: cell(eq.assetsMinor),
          code: cell("EQ.ASSETS"),
        });
        reportRows.push({
          path: cell("Tổng Nợ"),
          value: cell(eq.liabilitiesMinor),
          code: cell("EQ.LIABILITIES"),
        });
        reportRows.push({
          path: cell("Tổng Vốn chủ sở hữu"),
          value: cell(eq.equityMinor),
          code: cell("EQ.EQUITY"),
        });
        reportRows.push({
          path: cell("Chênh lệch"),
          value: cell(eq.differenceMinor),
          code: cell("EQ.DIFF"),
        });
        reportRows.push({
          path: cell("Cân bằng"),
          value: cell(eq.balanced ? "TRUE" : "FALSE"),
          code: cell("EQ.BALANCED"),
        });
      }

      if (result.operatingCashFlowMinor !== undefined) {
        reportRows.push({
          path: cell("Dòng tiền kinh doanh"),
          value: cell(result.operatingCashFlowMinor as string),
          code: cell("CASH.OP"),
        });
        reportRows.push({
          path: cell("Dòng tiền đầu tư"),
          value: cell(result.investingCashFlowMinor as string),
          code: cell("CASH.INV"),
        });
        reportRows.push({
          path: cell("Dòng tiền tài chính"),
          value: cell(result.financingCashFlowMinor as string),
          code: cell("CASH.FIN"),
        });
        reportRows.push({
          path: cell("Thay đổi tiền thuần"),
          value: cell(result.netCashMovementMinor as string),
          code: cell("CASH.NET"),
        });
        reportRows.push({
          path: cell("Tiền đầu kỳ"),
          value: cell(result.openingCashMinor as string),
          code: cell("CASH.OPEN"),
        });
        reportRows.push({
          path: cell("Tiền cuối kỳ"),
          value: cell(result.closingCashMinor as string),
          code: cell("CASH.CLOSE"),
        });
      }

      if (result.totals) {
        const t = result.totals as Record<string, unknown>;
        for (const [k, v] of Object.entries(t)) {
          reportRows.push({
            path: cell(`Tổng: ${k}`),
            value: cell(v as string),
            code: cell(`TOTAL.${k}`),
          });
        }
      }
      if (result.controls) {
        const c = result.controls as Record<string, unknown>;
        for (const [k, v] of Object.entries(c)) {
          reportRows.push({
            path: cell(`Kiểm soát: ${k}`),
            value: cell(v as string),
            code: cell(`CTRL.${k}`),
          });
        }
      }
    } else {
      // Fallback for unknown reports
      const flat: Record<string, unknown>[] = [];
      const walk = (v: unknown, path: string) => {
        if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
        else if (v && typeof v === "object")
          Object.entries(v)
            .sort()
            .forEach(([k, x]) => walk(x, path ? `${path}.${k}` : k));
        else flat.push({ path, value: v });
      };
      walk(result, "");
      reportRows.push(...flat.map((x) => ({ path: cell(x.path), value: cell(x.value) })));
    }

    const report: WorkbookSheet = {
      key: "report",
      name: "Report",
      columns: [
        { key: "code", label: "Mã" },
        { key: "path", label: "Chỉ tiêu" },
        { key: "value", label: "Số tiền" },
      ],
      rows: reportRows,
    };
    const mapping: WorkbookSheet = {
      key: "mapping",
      name: "Mapping",
      columns: [
        { key: "source", label: "Source key" },
        { key: "target", label: "Target key" },
        { key: "version", label: "Mapping version" },
        { key: "status", label: "Status" },
        { key: "reason", label: "Reason" },
      ],
      rows: snapshot.mappings.map((x) => ({
        source: cell(x.sourceKey),
        target: cell(x.targetKey),
        version: cell(x.mappingVersionId),
        status: cell(x.status),
        reason: cell(x.reason),
      })),
    };
    const unresolved: WorkbookSheet = {
      key: "unresolved",
      name: "Unresolved",
      columns: [
        { key: "code", label: "Code" },
        { key: "severity", label: "Severity" },
        { key: "sourceIds", label: "Source IDs" },
        { key: "message", label: "Message" },
      ],
      rows: snapshot.unresolvedItems.map((x) => ({
        code: cell(x.code),
        severity: cell(x.severity),
        sourceIds: cell(x.sourceIds.join(";")),
        message: cell(x.message),
      })),
    };
    const source: WorkbookSheet = {
      key: "source",
      name: "Source",
      columns: [
        { key: "field", label: "Field" },
        { key: "value", label: "Value" },
      ],
      rows: [
        ...Object.entries(snapshot.ledgerCutoff).map(([k, v]) => ({
          field: cell(`ledgerCutoff.${k}`),
          value: cell(v),
        })),
        ...snapshot.sourceManifest.map((item, index) => ({
          field: cell(`sourceManifest[${index}]`),
          value: cell(canonicalJson(item)),
        })),
      ],
    };
    return createAccountantWorkbook({
      snapshot,
      title: `${snapshot.reportKind} ${snapshot.period.asOfDate}`,
      currency: String(result.currency ?? "VND"),
      sheets: [
        summary,
        report,
        mapping,
        unresolved,
        source,
        ...(await this.accountingSheets(c, snapshot)),
      ],
    });
  }
  private tableSheet(
    key: string,
    name: string,
    rows: Record<string, unknown>[],
    fallback: string[],
  ): WorkbookSheet {
    const keys = [...new Set([...fallback, ...rows.flatMap((row) => Object.keys(row))])];
    return {
      key,
      name,
      columns: keys.map((x) => ({ key: x, label: x })),
      rows: rows.map((row) =>
        Object.fromEntries(
          keys.map((x) => [
            x,
            cell(
              row[x] && typeof row[x] === "object" ? canonicalJson(jsonSafe(row[x])) : row[x],
              x.toLowerCase().endsWith("minor") || x.endsWith("_minor") ? "money_minor" : "text",
            ),
          ]),
        ),
      ),
    };
  }
  private async accountingSheets(c: ReportExportContext, snapshot: ReportSnapshot) {
    const org = c.organizationId;
    const cutoff = snapshot.period.asOfDate;
    const query = (sql: string, dateScoped = true) =>
      this.pool.query(sql, dateScoped ? [org, cutoff] : [org]).then((x) => x.rows);
    const [
      journals,
      journalLines,
      sales,
      purchases,
      expenses,
      docAllocations,
      expenseAllocations,
      bank,
      payments,
      reconciliations,
      reconciliationAllocations,
      accounts,
      parties,
    ] = await Promise.all([
      query(
        `select id,journal_date::text journal_date,description,currency,state::text state,version::text version,reversal_of_id,created_by,approved_by,approved_at::text approved_at,posted_by,posted_at::text posted_at from journal_entries where organization_id=$1 and journal_date<=$2::date order by journal_date,id`,
      ),
      query(
        `select l.journal_id,l.line_number::text line_number,j.journal_date::text journal_date,l.account_code,l.debit_minor::text debit_minor,l.credit_minor::text credit_minor,l.description,l.dimensions from journal_lines l join journal_entries j on j.organization_id=l.organization_id and j.id=l.journal_id where l.organization_id=$1 and j.journal_date<=$2::date order by j.journal_date,l.journal_id,l.line_number`,
      ),
      query(
        `select d.id,d.type::text type,d.state::text state,d.document_number,d.series,d.fiscal_year::text fiscal_year,d.party_id,d.document_date::text document_date,d.due_date::text due_date,d.currency,d.net_minor::text net_minor,d.tax_minor::text tax_minor,d.gross_minor::text gross_minor,d.control_account_code,d.original_document_id,d.reason,d.journal_id,d.version::text version from commercial_documents d left join commercial_documents original on original.organization_id=d.organization_id and original.id=d.original_document_id where d.organization_id=$1 and d.document_date<=$2::date and (d.type='sales_invoice' or (d.type='credit_note' and original.type='sales_invoice')) order by d.document_date,d.id`,
      ),
      query(
        `select id,type::text type,state::text state,document_number,party_id,document_date::text document_date,due_date::text due_date,currency,net_minor::text net_minor,tax_minor::text tax_minor,gross_minor::text gross_minor,control_account_code,journal_id,version::text version from commercial_documents where organization_id=$1 and document_date<=$2::date and type='purchase_invoice' order by document_date,id`,
      ),
      query(
        `select id,expense_class::text expense_class,state::text state,payee_party_id,employee_party_id,expense_date::text expense_date,business_purpose,currency,net_minor::text net_minor,vat_minor::text vat_minor,gross_minor::text gross_minor,counter_account_code,cit_state::text cit_state,vat_state::text vat_state,evidence_checklist,journal_id,version::text version from expenses where organization_id=$1 and expense_date<=$2::date order by expense_date,id`,
      ),
      query(
        `select a.document_id,a.line_number::text line_number,a.allocation_number::text allocation_number,a.amount_minor::text amount_minor,a.dimensions from commercial_document_allocations a join commercial_documents d on d.organization_id=a.organization_id and d.id=a.document_id where a.organization_id=$1 and d.document_date<=$2::date order by a.document_id,a.line_number,a.allocation_number`,
      ),
      query(
        `select a.expense_id,a.line_number::text line_number,a.allocation_number::text allocation_number,a.amount_minor::text amount_minor,a.dimensions from expense_allocations a join expenses e on e.organization_id=a.organization_id and e.id=a.expense_id where a.organization_id=$1 and e.expense_date<=$2::date order by a.expense_id,a.line_number,a.allocation_number`,
      ),
      query(
        `select id,financial_account_id,booking_date::text booking_date,value_date::text value_date,amount_minor::text amount_minor,currency,reference,description,counterparty_name,state::text state,version::text version from bank_transactions where organization_id=$1 and booking_date<=$2::date order by booking_date,id`,
      ),
      query(
        `select p.id,p.bank_transaction_id,p.direction,p.statement_amount_minor::text statement_amount_minor,p.statement_currency,p.current_attempt_number::text current_attempt_number,p.version::text version from payment_reconciliations p join bank_transactions b on b.organization_id=p.organization_id and b.id=p.bank_transaction_id where p.organization_id=$1 and b.booking_date<=$2::date order by b.booking_date,p.id`,
      ),
      query(
        `select r.id,r.reconciliation_id,r.attempt_number::text attempt_number,r.state::text state,r.bank_transaction_id,r.bank_amount_minor::text bank_amount_minor,r.bank_currency,r.base_amount_minor::text base_amount_minor,r.journal_id,r.reversal_journal_id,r.version::text version from reconciliation_attempts r join bank_transactions b on b.organization_id=r.organization_id and b.id=r.bank_transaction_id where r.organization_id=$1 and b.booking_date<=$2::date order by b.booking_date,r.id`,
      ),
      query(
        `select a.id,a.reconciliation_id,a.line_number::text line_number,a.target_type::text target_type,a.commercial_document_id,a.expense_id,a.target_amount_minor::text target_amount_minor,a.target_currency,a.base_amount_minor::text base_amount_minor,a.statement_amount_minor::text statement_amount_minor,a.target_outstanding_before_minor::text target_outstanding_before_minor,a.control_account_code from reconciliation_allocations a join reconciliation_attempts r on r.organization_id=a.organization_id and r.id=a.reconciliation_id join bank_transactions b on b.organization_id=r.organization_id and b.id=r.bank_transaction_id where a.organization_id=$1 and b.booking_date<=$2::date order by b.booking_date,a.id`,
      ),
      query(
        `select code,name,root_type::text root_type,is_control_account,allow_manual_posting from accounts where organization_id=$1 order by code`,
        false,
      ),
      query(
        `select id,display_name,status::text status,normalized_tax_id from parties where organization_id=$1 order by id`,
        false,
      ),
    ]);
    return [
      this.tableSheet("journal_entries", "Journal Entries", journals, [
        "id",
        "journal_date",
        "state",
      ]),
      this.tableSheet("journal_lines", "Journal Lines", journalLines, [
        "journal_id",
        "line_number",
        "account_code",
        "debit_minor",
        "credit_minor",
      ]),
      this.tableSheet("sales_invoices", "Sales Invoices", sales, [
        "id",
        "type",
        "state",
        "document_number",
        "document_date",
        "party_id",
        "net_minor",
        "tax_minor",
        "gross_minor",
      ]),
      this.tableSheet("purchase_invoices", "Purchase Invoices", purchases, [
        "id",
        "state",
        "document_number",
        "document_date",
        "party_id",
        "net_minor",
        "tax_minor",
        "gross_minor",
      ]),
      this.tableSheet("expenses", "Expenses", expenses, [
        "id",
        "state",
        "expense_date",
        "payee_party_id",
        "net_minor",
        "vat_minor",
        "gross_minor",
      ]),
      this.tableSheet("document_allocations", "Invoice Allocations", docAllocations, [
        "document_id",
        "line_number",
        "allocation_number",
        "amount_minor",
        "dimensions",
      ]),
      this.tableSheet("expense_allocations", "Expense Allocations", expenseAllocations, [
        "expense_id",
        "line_number",
        "allocation_number",
        "amount_minor",
        "dimensions",
      ]),
      this.tableSheet("bank_transactions", "Bank Transactions", bank, [
        "id",
        "booking_date",
        "amount_minor",
        "currency",
        "state",
      ]),
      this.tableSheet("payments", "Payments", payments, [
        "id",
        "bank_transaction_id",
        "direction",
        "statement_amount_minor",
        "statement_currency",
      ]),
      this.tableSheet("reconciliations", "Reconciliations", reconciliations, [
        "id",
        "reconciliation_id",
        "state",
        "bank_amount_minor",
        "base_amount_minor",
      ]),
      this.tableSheet(
        "reconciliation_allocations",
        "Payment Allocations",
        reconciliationAllocations,
        [
          "id",
          "reconciliation_id",
          "target_type",
          "commercial_document_id",
          "expense_id",
          "target_amount_minor",
        ],
      ),
      this.tableSheet("accounts", "Accounts", accounts, ["code", "name", "root_type"]),
      this.tableSheet("parties", "Parties", parties, [
        "id",
        "display_name",
        "status",
        "normalized_tax_id",
      ]),
    ];
  }
  private csv(sheets: readonly WorkbookSheet[]) {
    const columns = [
      { key: "sheet", label: "Sheet" },
      { key: "row", label: "Row" },
      { key: "key", label: "Key" },
      { key: "value", label: "Value" },
      { key: "format", label: "Format" },
    ] as const;
    const rows: Record<string, WorkbookCell>[] = [];
    for (const sheet of sheets) {
      if (sheet.rows.length === 0)
        rows.push({
          sheet: cell(sheet.name),
          row: cell(0, "integer"),
          key: cell(null),
          value: cell(null),
          format: cell("text"),
        });
      sheet.rows.forEach((row, index) =>
        Object.entries(row)
          .sort()
          .forEach(([key, value]) =>
            rows.push({
              sheet: cell(sheet.name),
              row: cell(index + 1, "integer"),
              key: cell(key),
              value: cell(value.value, value.format),
              format: cell(value.format ?? "text"),
            }),
          ),
      );
    }
    return workbookSheetToCsv({
      key: "accountant_export",
      name: "Accountant Export",
      columns,
      rows,
    });
  }
  private async xlsx(workbook: ReturnType<typeof createAccountantWorkbook>) {
    const book = new ExcelJS.Workbook();
    book.creator = "NAAI ERP";
    book.created = new Date("2000-01-01T00:00:00.000Z");
    book.modified = book.created;
    book.calcProperties.fullCalcOnLoad = false;
    for (const sheet of workbook.sheets) {
      const ws = book.addWorksheet(sheet.name, { properties: { defaultRowHeight: 20 } });
      ws.columns = sheet.columns.map((x) => ({
        header: x.label,
        key: x.key,
        width: Math.max(16, x.label.length + 4),
      }));

      // Add rows and format numbers
      for (const row of sheet.rows) {
        const addedRow = ws.addRow(
          Object.fromEntries(
            sheet.columns.map((x) => {
              let val = row[x.key]?.value ?? null;
              const fmt = row[x.key]?.format;
              if (
                val !== null &&
                (fmt === "money_minor" || fmt === "integer" || (!isNaN(Number(val)) && val !== ""))
              ) {
                if (
                  typeof val === "string" &&
                  /^-?\d+$/.test(val) &&
                  BigInt(val) <= BigInt(Number.MAX_SAFE_INTEGER) &&
                  BigInt(val) >= BigInt(Number.MIN_SAFE_INTEGER)
                )
                  val = Number(val);
              }
              return [x.key, val];
            }),
          ),
        );

        // Apply number formats
        sheet.columns.forEach((col, index) => {
          const cellInfo = row[col.key];
          const fmt = cellInfo?.format;
          const excelCell = addedRow.getCell(index + 1);

          if (fmt === "money_minor") excelCell.numFmt = '#,##0 "₫";[Red]-#,##0 "₫"';
          else if (fmt === "integer" || typeof excelCell.value === "number")
            excelCell.numFmt = "#,##0";
          if (/date|_on$|_at$/.test(col.key)) excelCell.numFmt = "yyyy-mm-dd";
          excelCell.alignment = { vertical: "top", wrapText: true };
        });
      }

      // Beautiful header formatting
      const headerRow = ws.getRow(1);
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
      headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF4F81BD" }, // Nice corporate blue
      };
      headerRow.alignment = { vertical: "middle", horizontal: "center" };

      ws.views = [{ state: "frozen", ySplit: 1 }];
      if (sheet.columns.length)
        ws.autoFilter = {
          from: { row: 1, column: 1 },
          to: { row: 1, column: sheet.columns.length },
        };
      ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
      ws.pageSetup.printTitlesRow = "1:1";
      if (sheet.name === "Summary") {
        ws.eachRow((row, rowNumber) => {
          if (rowNumber > 1 && /review|unresolved/i.test(String(row.getCell(2).value ?? "")))
            row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE699" } };
        });
      }

      // Auto-fit column widths based on content
      ws.columns?.forEach((column) => {
        let maxLength = 0;
        column.eachCell?.({ includeEmpty: true }, (cellVal) => {
          const columnLength = cellVal && cellVal.value ? cellVal.value.toString().length : 10;
          if (columnLength > maxLength) {
            maxLength = columnLength;
          }
        });
        column.width = maxLength < 10 ? 10 : Math.min(maxLength + 2, 60);
      });
    }
    return normalizeZipTimestamps(Buffer.from(await book.xlsx.writeBuffer()));
  }
  private async audit(
    client: PoolClient,
    c: ReportExportContext,
    type: string,
    key: string,
    version: number,
    action: string,
    before: unknown,
    after: unknown,
  ) {
    await client.query(
      `insert into resource_audit_events(organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,before_state,after_state) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        c.organizationId,
        randomUUID(),
        type,
        key,
        version,
        action,
        c.actorId,
        c.correlationId,
        before,
        after,
      ],
    );
  }
}
