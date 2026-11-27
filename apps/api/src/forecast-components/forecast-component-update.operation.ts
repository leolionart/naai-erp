/* eslint-disable @typescript-eslint/no-explicit-any -- PostgreSQL rows are normalized at the store boundary. */
import {
  buildForecastComposition,
  createForecastComponent,
  excludeForecastComponent,
  reviewForecastManualAdjustment,
  type ForecastComponent,
} from "@naai-erp/domain";
import type pg from "pg";
import { type PoolClient } from "pg";
import {
  canSelfApprove,
  resolveOrganizationWorkflowPolicy,
} from "../workflow-policy/organization-workflow-policy.service.js";
import type { ForecastComponentContext } from "./forecast-component.types.js";
import type { PgForecastComponentStore } from "./pg-forecast-component.store.js";

export function updateOperation(
  this: PgForecastComponentStore,
  c: ForecastComponentContext,
  forecastId: string,
  id: string,
  input: Record<string, unknown>,
  key: string,
) {
  return this.mutate(c, key, "forecast-components:update", { forecastId, id, input }, async (q) => {
    const parent = await this.mutableParent(q, c.organizationId, forecastId),
      raw = await this.lock(q, c.organizationId, forecastId, id);
    if (String(raw.version) !== String(input.expectedResourceVersion))
      throw new Error("VERSION_CONFLICT");
    const old = this.domain(raw),
      component = createForecastComponent(this.context(parent), {
        id,
        section: old.section,
        kind: old.kind,
        direction: old.direction,
        scheduledOn: String(input.scheduledOn ?? old.scheduledOn),
        amountMinor: BigInt(String(input.amountMinor ?? old.amountMinor)),
        probabilityBps: Number(input.probabilityBps ?? old.probabilityBps),
        currency: old.currency,
        source: old.source,
        sourceSnapshot: (input.sourceSnapshot ??
          old.sourceSnapshot) as ForecastComponent["sourceSnapshot"],
        dimensions: (input.dimensions ?? old.dimensions) as ForecastComponent["dimensions"],
        ...(String(input.note ?? old.note ?? "").trim()
          ? { note: String(input.note ?? old.note) }
          : {}),
        createdBy: old.createdBy,
      });
    await this.assertNoDoubleCount(q, component, id);
    const version = (BigInt(raw.version) + 1n).toString();
    await q.query(
      `update forecast_components set scheduled_on=$4,amount_minor=$5,probability_bps=$6,source_snapshot=$7,dimensions=$8,note=$9,reviewed_by=null,reviewed_at=null,review_reason=null,version=$10,reason=$11,updated_at=now() where organization_id=$1 and forecast_version_id=$2 and id=$3`,
      [
        c.organizationId,
        forecastId,
        id,
        component.scheduledOn,
        component.amountMinor,
        component.probabilityBps,
        JSON.stringify(component.sourceSnapshot),
        JSON.stringify(component.dimensions),
        component.note ?? null,
        version,
        input.reason,
      ],
    );
    const auditEventId = await this.audit(q, c, id, "update", version, String(input.reason));
    return {
      resource: await this.getWith(q, c.organizationId, forecastId, id),
      mutation: this.meta(c, version, auditEventId, false),
    };
  });
}

export function transitionOperation(
  this: PgForecastComponentStore,
  c: ForecastComponentContext,
  forecastId: string,
  id: string,
  action: "review" | "exclude",
  input: Record<string, unknown>,
  key: string,
) {
  return this.mutate(
    c,
    key,
    `forecast-components:${action}`,
    { forecastId, id, input },
    async (q) => {
      await this.mutableParent(q, c.organizationId, forecastId);
      const raw = await this.lock(q, c.organizationId, forecastId, id);
      if (String(raw.version) !== String(input.expectedResourceVersion))
        throw new Error("VERSION_CONFLICT");
      const now = new Date().toISOString(),
        current = this.domain(raw);
      const policy = await resolveOrganizationWorkflowPolicy(c.organizationId, q);
      const allowSelfApproval = canSelfApprove({ policy, roles: c.roles });
      let next: ForecastComponent;
      try {
        next =
          action === "review"
            ? reviewForecastManualAdjustment(
                current,
                c.actorId,
                String(input.reason),
                now,
                allowSelfApproval,
              )
            : excludeForecastComponent(current, c.actorId, String(input.reason), now);
      } catch (error) {
        if (error instanceof Error && error.message.includes("maker-checker"))
          throw new Error("MAKER_CHECKER_VIOLATION");
        throw error;
      }
      if (action === "review")
        await q.query(
          `update forecast_components set reviewed_by=$4,reviewed_at=$5,review_reason=$6,version=$7,updated_at=now() where organization_id=$1 and forecast_version_id=$2 and id=$3`,
          [
            c.organizationId,
            forecastId,
            id,
            next.reviewedBy,
            next.reviewedAt,
            next.reviewReason,
            next.version,
          ],
        );
      else
        await q.query(
          `update forecast_components set excluded=true,excluded_by=$4,excluded_at=$5,exclusion_reason=$6,version=$7,updated_at=now() where organization_id=$1 and forecast_version_id=$2 and id=$3`,
          [
            c.organizationId,
            forecastId,
            id,
            next.excludedBy,
            next.excludedAt,
            next.exclusionReason,
            next.version,
          ],
        );
      const auditEventId = await this.audit(
        q,
        c,
        id,
        action,
        String(next.version),
        String(input.reason),
      );
      return {
        resource: await this.getWith(q, c.organizationId, forecastId, id),
        mutation: this.meta(c, String(next.version), auditEventId, false),
      };
    },
  );
}

export async function compositionWithOperation(
  this: PgForecastComponentStore,
  q: Pick<PoolClient, "query"> | pg.Pool,
  organizationId: string,
  forecastId: string,
  parentRow?: any,
  immutableOutput = false,
) {
  const parent = parentRow ?? (await this.parent(q, organizationId, forecastId));
  const rows = (
    await q.query(
      `select * from forecast_components where organization_id=$1 and forecast_version_id=$2 order by section,scheduled_on,id`,
      [organizationId, forecastId],
    )
  ).rows;
  const all = rows.map((row) => this.domain(row)),
    pending = all.filter((x) => x.state === "active" && x.reviewState === "pending");
  const included = all.filter((x) => x.state === "active" && x.reviewState !== "pending"),
    opening = included.filter((x) => x.section === "cash" && x.kind === "opening_cash"),
    composable =
      opening.length > 1
        ? included.filter((x) => x.kind !== "opening_cash" || x.id === opening[0]!.id)
        : included;
  const actual = await this.actual(
    q,
    organizationId,
    parent.actual_basis,
    this.dateText(parent.as_of_date),
    parent.currency,
    this.dateText(parent.starts_on),
  );
  const confidenceFlags = [
    ...(pending.length
      ? [
          {
            code: "pending_manual_review",
            severity: "warning",
            componentIds: pending.map((x) => x.id).sort(),
          },
        ]
      : []),
    ...(opening.length === 0
      ? [
          {
            code: "missing_opening_cash",
            severity: "critical",
            componentIds: opening.map((x) => x.id).sort(),
          },
        ]
      : []),
    ...(opening.length > 1
      ? [
          {
            code: "duplicate_source",
            severity: "critical",
            componentIds: opening.map((x) => x.id).sort(),
          },
        ]
      : []),
  ];
  const built = buildForecastComposition({
    context: this.context(parent),
    actualToDateMinor: actual.amountMinor,
    components: composable,
  });
  const amount = (key: keyof typeof built) => (built[key] as bigint).toString();
  return {
    schemaVersion: 1,
    organizationId,
    forecastVersionId: forecastId,
    formulaVersion: "forecast-composition-v1",
    actualBasis: parent.actual_basis,
    asOfDate: this.dateText(parent.as_of_date),
    startsOn: this.dateText(parent.starts_on),
    endsOn: this.dateText(parent.ends_on),
    currency: parent.currency,
    actualToDateMinor: actual.amountMinor.toString(),
    committedMilestonesMinor: amount("committedMilestonesMinor"),
    scheduledRecurringRevenueMinor: amount("scheduledRecurringRevenueMinor"),
    weightedPipelineMinor: amount("weightedPipelineMinor"),
    manualRevenueAdjustmentMinor: amount("manualRevenueAdjustmentMinor"),
    projectedRevenueMinor: amount("projectedRevenueMinor"),
    payrollExpenseMinor: amount("payrollExpenseMinor"),
    recurringOpexMinor: amount("recurringOpexMinor"),
    manualExpenseAdjustmentMinor: amount("manualExpenseAdjustmentMinor"),
    projectedExpenseMinor: amount("projectedExpenseMinor"),
    openingCashMinor: amount("openingCashMinor"),
    expectedCollectionsMinor: amount("expectedCollectionsMinor"),
    financingMinor: amount("financingMinor"),
    payrollCashOutMinor: amount("payrollCashOutMinor"),
    apDueMinor: amount("apDueMinor"),
    recurringExpenseCashOutMinor: amount("recurringExpenseCashOutMinor"),
    taxCashOutMinor: amount("taxCashOutMinor"),
    capexCashOutMinor: amount("capexCashOutMinor"),
    manualCashAdjustmentMinor: amount("manualCashAdjustmentMinor"),
    projectedClosingCashMinor: amount("projectedClosingCashMinor"),
    componentIds: built.componentIds,
    sourceIds: built.sourceIds,
    components: rows.map((row) =>
      this.contract(this.rowContract(row), !immutableOutput && parent.state === "draft"),
    ),
    confidenceFlags,
    drilldown: {
      actualIds: actual.ids.sort(),
      excludedComponentIds: all
        .filter((x) => x.state === "excluded")
        .map((x) => x.id)
        .sort(),
      pendingReviewComponentIds: pending.map((x) => x.id).sort(),
    },
  };
}

export function domainOperation(this: PgForecastComponentStore, row: any): ForecastComponent {
  return {
    organizationId: row.organization_id,
    forecastVersionId: row.forecast_version_id,
    id: row.id,
    section: row.section,
    kind: row.kind,
    direction: row.direction,
    scheduledOn: this.dateText(row.scheduled_on),
    amountMinor: BigInt(row.amount_minor),
    probabilityBps: row.probability_bps,
    currency: row.currency,
    source: {
      type: row.source_type,
      id: row.source_id,
      ...(row.commercial_root_type
        ? {
            commercialRootType: row.commercial_root_type,
            commercialRootId: row.commercial_root_id,
          }
        : {}),
    },
    sourceSnapshot: row.source_snapshot ?? {},
    dimensions: row.dimensions ?? {},
    ...(row.note ? { note: row.note } : {}),
    createdBy: row.created_by,
    state: row.excluded ? "excluded" : "active",
    reviewState:
      row.kind !== "manual_adjustment" ? "not_required" : row.reviewed_by ? "reviewed" : "pending",
    version: Number(row.version),
    ...(row.reviewed_by
      ? {
          reviewedBy: row.reviewed_by,
          reviewedAt: new Date(row.reviewed_at).toISOString(),
          reviewReason: row.review_reason,
        }
      : {}),
    ...(row.excluded_by
      ? {
          excludedBy: row.excluded_by,
          excludedAt: new Date(row.excluded_at).toISOString(),
          exclusionReason: row.exclusion_reason,
        }
      : {}),
  };
}
