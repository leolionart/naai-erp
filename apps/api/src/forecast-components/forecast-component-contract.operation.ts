/* eslint-disable @typescript-eslint/no-explicit-any -- PostgreSQL rows are normalized at the store boundary. */
import { weightedForecastComponentMinor } from "@naai-erp/domain";
import type { PgForecastComponentStore } from "./pg-forecast-component.store.js";

export function contractOperation(this: PgForecastComponentStore, row: any, mutable = true) {
  const x = this.domain({
    organization_id: row.organization_id ?? "",
    forecast_version_id: row.forecastVersionId,
    id: row.id,
    section: row.section,
    kind: row.kind,
    direction: row.direction,
    scheduled_on: row.scheduledOn,
    amount_minor: row.amountMinor,
    probability_bps: row.probabilityBps,
    currency: row.currency,
    source_type: row.sourceType,
    source_id: row.sourceId,
    commercial_root_type: row.commercialRootType,
    commercial_root_id: row.commercialRootId,
    source_snapshot: row.sourceSnapshot,
    dimensions: row.dimensions,
    note: row.note,
    created_by: row.createdBy,
    excluded: row.excluded,
    excluded_by: row.excludedBy,
    excluded_at: row.excludedAt,
    exclusion_reason: row.exclusionReason,
    reviewed_by: row.reviewedBy,
    reviewed_at: row.reviewedAt,
    review_reason: row.reviewReason,
    version: row.resourceVersion,
  });
  return {
    schemaVersion: 1,
    id: x.id,
    forecastVersionId: x.forecastVersionId,
    section: x.section,
    kind: x.kind,
    direction: x.direction,
    scheduledOn: x.scheduledOn,
    amountMinor: x.amountMinor.toString(),
    probabilityBps: x.probabilityBps,
    weightedAmountMinor: weightedForecastComponentMinor(x).toString(),
    currency: x.currency,
    source: x.source,
    sourceSnapshot: x.sourceSnapshot,
    dimensions: x.dimensions,
    ...(x.note ? { note: x.note } : {}),
    state: x.state,
    reviewState: x.reviewState,
    createdBy: x.createdBy,
    ...(x.reviewedBy
      ? { reviewedBy: x.reviewedBy, reviewedAt: x.reviewedAt, reviewReason: x.reviewReason }
      : {}),
    ...(x.excludedBy
      ? { excludedBy: x.excludedBy, excludedAt: x.excludedAt, exclusionReason: x.exclusionReason }
      : {}),
    resourceVersion: String(x.version),
    nextActions: !mutable
      ? []
      : x.state === "excluded"
        ? ["delete"]
        : x.reviewState === "pending"
          ? ["update", "delete", "review", "exclude"]
          : ["update", "delete", "exclude"],
  };
}
