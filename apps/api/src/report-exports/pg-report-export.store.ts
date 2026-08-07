import { createHash, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
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
  ReportExportContext,
  ReportKind,
  SnapshotInput,
} from "./report-export.types.js";

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
      workbook = this.workbook(snapshot),
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
  private workbook(snapshot: ReportSnapshot) {
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
    const reportRows: { path: any; value: any; code?: any }[] = [];

    if (
      ["profit_and_loss", "balance_sheet", "cash_flow", "vat_reconciliation"].includes(
        snapshot.reportKind,
      )
    ) {
      const lines = Array.isArray(result.lines) ? result.lines : [];
      reportRows.push({ path: cell("Chỉ tiêu"), value: cell("Số tiền"), code: cell("Mã") });
      for (const line of lines as any[]) {
        reportRows.push({
          path: cell(line.label ?? ""),
          value: cell(line.amountMinor ?? ""),
          code: cell(line.lineCode ?? ""),
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
        const eq = result.equation as any;
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
      }

      if (result.openingCashMinor !== undefined) {
        reportRows.push({
          path: cell("Tiền đầu kỳ"),
          value: cell(result.openingCashMinor as string),
          code: cell("CASH.OPEN"),
        });
        reportRows.push({
          path: cell("Lưu chuyển HĐ Kinh doanh"),
          value: cell(result.operatingCashFlowMinor as string),
          code: cell("CASH.OP"),
        });
        reportRows.push({
          path: cell("Lưu chuyển HĐ Đầu tư"),
          value: cell(result.investingCashFlowMinor as string),
          code: cell("CASH.INV"),
        });
        reportRows.push({
          path: cell("Lưu chuyển HĐ Tài chính"),
          value: cell(result.financingCashFlowMinor as string),
          code: cell("CASH.FIN"),
        });
        reportRows.push({
          path: cell("Lưu chuyển thuần"),
          value: cell(result.netCashMovementMinor as string),
          code: cell("CASH.NET"),
        });
        reportRows.push({
          path: cell("Tiền cuối kỳ"),
          value: cell(result.closingCashMinor as string),
          code: cell("CASH.CLOSE"),
        });
      }

      if (result.totals) {
        const t = result.totals as any;
        for (const [k, v] of Object.entries(t)) {
          reportRows.push({
            path: cell(`Tổng: ${k}`),
            value: cell(v as string),
            code: cell(`TOTAL.${k}`),
          });
        }
      }
      if (result.controls) {
        const c = result.controls as any;
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
      sheets: [summary, report, mapping, unresolved, source],
    });
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
                (fmt === "number" || fmt === "integer" || (!isNaN(Number(val)) && val !== ""))
              ) {
                // Convert string numbers to real numbers for Excel to format them properly
                if (typeof val === "string") val = Number(val);
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

          if (fmt === "number" || fmt === "integer" || typeof excelCell.value === "number") {
            excelCell.numFmt = "#,##0"; // format with thousands separator
          }
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

      // Auto-fit column widths based on content
      ws.columns.forEach((column) => {
        let maxLength = 0;
        column.eachCell({ includeEmpty: true }, (cell) => {
          const columnLength = cell.value ? cell.value.toString().length : 10;
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
