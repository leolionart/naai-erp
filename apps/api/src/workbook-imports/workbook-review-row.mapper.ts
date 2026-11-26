import type { WorkbookImportReviewStatus } from "./workbook-import.types.js";

export type ReviewRowRecord = {
  id: string;
  import_identity: string;
  source_identity: string;
  workbook: string;
  sheet: string;
  source_row: number;
  kind: string;
  proposed_resource_type: string;
  proposed_resource_id: string | null;
  status: WorkbookImportReviewStatus;
  review_flags: unknown;
  raw_data: unknown;
  mapped_data: unknown;
  resolution: unknown;
  notes: string | null;
  version: string;
  created_by: string;
  updated_by: string;
  created_at: Date | string;
  updated_at: Date | string;
};

export function mapWorkbookReviewRow(row: ReviewRowRecord) {
  return {
    id: row.id,
    importIdentity: row.import_identity,
    sourceIdentity: row.source_identity,
    workbook: row.workbook,
    sheet: row.sheet,
    sourceRow: row.source_row,
    kind: row.kind,
    proposedResourceType: row.proposed_resource_type,
    proposedResourceId: row.proposed_resource_id,
    status: row.status,
    reviewFlags: row.review_flags,
    rawData: row.raw_data,
    mappedData: row.mapped_data,
    resolution: row.resolution,
    notes: row.notes,
    resourceVersion: row.version,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
