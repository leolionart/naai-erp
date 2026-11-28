import type { Pool } from "pg";
import type { RawListQuery } from "@naai-erp/contracts";
import {
  createReportSnapshot,
  type CanonicalJsonValue,
  type ReportSnapshot,
  type SnapshotMapping,
  type SnapshotUnresolvedItem,
} from "@naai-erp/domain";
import {
  countRows,
  cursorParams,
  keysetSql,
  parseDatedList,
  toListResponse,
} from "../common/dated-list.js";
import type { ReportKind } from "./report-export.types.js";

export type SnapshotRow = Record<string, unknown> & {
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

export const jsonSafe = (value: unknown): CanonicalJsonValue => {
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

const iso = (value: Date | string) => new Date(value).toISOString();
const isoDate = (value: Date | string) => String(value).slice(0, 10);

export function toSnapshotContract(r: SnapshotRow): ReportSnapshot {
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

const SNAPSHOT_FILTER = `where organization_id=$1
  and ($2::text is null or id ilike $2 or report_kind ilike $2 or accounting_basis ilike $2 or coalesce(framework,'') ilike $2)`;

const EXPORT_FILTER = `where organization_id=$1
  and ($2::text is null or id ilike $2 or snapshot_id ilike $2 or filename ilike $2 or label ilike $2)`;

type ExportListRow = {
  id: string;
  version: number;
  snapshot_id: string;
  snapshot_version: number;
  format: "csv" | "xlsx";
  state: "generated" | "superseded";
  manifest: Record<string, unknown>;
  content_available: boolean;
  content_hash: string;
  size_bytes: string;
  media_type: string;
  filename: string;
  generated_by: string;
  generated_at: Date | string;
  generated_at_key: string;
};

/** Keyset page of report snapshots ordered by captured_at, id (BR-READ-002). */
export async function listReportSnapshotPage(
  pool: Pool,
  organizationId: string,
  mapSnapshot: (row: Record<string, unknown>) => ReportSnapshot,
  raw: RawListQuery = {},
) {
  const { query, ascending, search } = parseDatedList(raw);
  const params = [organizationId, search];
  const keyset = keysetSql("captured_at", "id", ascending, 3, 4, "timestamptz");
  const result = await pool.query<
    Record<string, unknown> & { id: string; captured_at_key: string }
  >(
    `select *, period_starts_on::text period_starts_on, period_ends_on::text period_ends_on,
            captured_at::text captured_at_key
       from report_snapshots
       ${SNAPSHOT_FILTER} and ${keyset.where}
       order by ${keyset.orderBy}
       limit $5`,
    [...params, ...cursorParams(query.cursor), query.limit + 1],
  );
  const total = query.includeTotal
    ? await countRows(pool, "report_snapshots", SNAPSHOT_FILTER, params)
    : undefined;
  const mapped = result.rows.map((row) => ({
    ...mapSnapshot(row),
    captured_at_key: row.captured_at_key,
  }));
  return toListResponse(mapped, query, (row) => row.captured_at_key, {
    ...(total === undefined ? {} : { total }),
    mapItem: ({ captured_at_key: _key, ...item }) => item,
  });
}

/** Keyset page of accountant exports ordered by generated_at, id without reading bytea content (BR-READ-002). */
export async function listAccountantExportPage(
  pool: Pool,
  organizationId: string,
  mapSnapshot: (row: Record<string, unknown>) => ReportSnapshot,
  raw: RawListQuery = {},
) {
  const { query, ascending, search } = parseDatedList(raw);
  const params = [organizationId, search];
  const keyset = keysetSql("generated_at", "id", ascending, 3, 4, "timestamptz");
  const result = await pool.query<ExportListRow>(
    `select id, version, snapshot_id, snapshot_version, format, state, manifest,
            (content is not null) as content_available, content_hash, size_bytes::text as size_bytes,
            media_type, filename, generated_by, generated_at, generated_at::text as generated_at_key
       from accountant_exports
       ${EXPORT_FILTER} and ${keyset.where}
       order by ${keyset.orderBy}
       limit $5`,
    [...params, ...cursorParams(query.cursor), query.limit + 1],
  );
  const snapshotIds = [...new Set(result.rows.map((r) => r.snapshot_id))];
  const snapshotByKey = new Map<string, ReportSnapshot>();
  if (snapshotIds.length > 0) {
    const snaps = await pool.query<Record<string, unknown> & { id: string; version: number }>(
      `select *, period_starts_on::text period_starts_on, period_ends_on::text period_ends_on
         from report_snapshots
        where organization_id=$1 and id = any($2::text[])`,
      [organizationId, snapshotIds],
    );
    for (const s of snaps.rows) {
      snapshotByKey.set(`${s.id}:${Number(s.version)}`, mapSnapshot(s));
    }
  }
  const total = query.includeTotal
    ? await countRows(pool, "accountant_exports", EXPORT_FILTER, params)
    : undefined;
  const mapped = result.rows.map((r) => {
    const snapshot = snapshotByKey.get(`${r.snapshot_id}:${Number(r.snapshot_version)}`);
    if (!snapshot) throw new Error("RESOURCE_NOT_FOUND");
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
      contentAvailable: Boolean(r.content_available),
      downloadUrl: `/api/v1/organizations/${encodeURIComponent(organizationId)}/accountant-exports/${encodeURIComponent(r.id)}/versions/${r.version}/download`,
      generated_at_key: r.generated_at_key,
    };
  });
  return toListResponse(mapped, query, (row) => row.generated_at_key, {
    ...(total === undefined ? {} : { total }),
    mapItem: ({ generated_at_key: _key, ...item }) => item,
  });
}
