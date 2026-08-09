/* eslint-disable @typescript-eslint/no-explicit-any -- PostgreSQL rows are normalized at the store boundary. */
import { createHash, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import {
  buildForecastComposition,
  createForecastComponent,
  excludeForecastComponent,
  reviewForecastManualAdjustment,
  weightedForecastComponentMinor,
  type ForecastComponent,
  type ForecastCompositionContext,
} from "@naai-erp/domain";
import pg, { type PoolClient } from "pg";
import {
  canSelfApprove,
  resolveOrganizationWorkflowPolicy,
} from "../workflow-policy/organization-workflow-policy.service.js";
import type { ForecastComponentContext } from "./forecast-component.types.js";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

@Injectable()
export class PgForecastComponentStore {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  async list(
    c: ForecastComponentContext,
    forecastId: string,
    filters: Record<string, string | undefined>,
  ) {
    const parent = await this.parent(this.pool, c.organizationId, forecastId);
    const values: unknown[] = [c.organizationId, forecastId];
    let where = "";
    const add = (sql: string, value: string | undefined) => {
      if (!value) return;
      values.push(value);
      where += ` and ${sql.replace("?", `$${values.length}`)}`;
    };
    add("section=?", filters.section);
    add("kind=?", filters.kind);
    add("source_type=?", filters.sourceType);
    add("scheduled_on>=?", filters.scheduledFrom);
    add("scheduled_on<=?", filters.scheduledTo);
    add("id>?", filters.cursor);
    if (filters.state === "active") where += " and excluded=false";
    if (filters.state === "excluded") where += " and excluded=true";
    if (filters.reviewState === "pending")
      where += " and kind='manual_adjustment' and reviewed_by is null";
    if (filters.reviewState === "reviewed") where += " and reviewed_by is not null";
    if (filters.reviewState === "not_required") where += " and kind<>'manual_adjustment'";
    const limit = Math.min(100, Math.max(1, Number(filters.limit ?? 50) || 50));
    values.push(limit + 1);
    const rows = (
      await this.pool.query(
        `${this.select()} where organization_id=$1 and forecast_version_id=$2${where} order by id limit $${values.length}`,
        values,
      )
    ).rows;
    return {
      items: rows.slice(0, limit).map((row) => this.contract(row, parent.state === "draft")),
      ...(rows.length > limit ? { nextCursor: rows[limit - 1]?.id } : {}),
    };
  }
  async get(c: ForecastComponentContext, forecastId: string, id: string) {
    const parent = await this.parent(this.pool, c.organizationId, forecastId);
    return this.getWith(this.pool, c.organizationId, forecastId, id, parent.state === "draft");
  }
  create(
    c: ForecastComponentContext,
    forecastId: string,
    input: Record<string, unknown>,
    key: string,
  ) {
    return this.mutate(c, key, "forecast-components:create", { forecastId, input }, async (q) => {
      const parent = await this.mutableParent(q, c.organizationId, forecastId);
      const component = createForecastComponent(this.context(parent), {
        id: String(input.id ?? randomUUID()),
        section: input.section as ForecastComponent["section"],
        kind: input.kind as ForecastComponent["kind"],
        direction: input.direction as ForecastComponent["direction"],
        scheduledOn: String(input.scheduledOn),
        amountMinor: BigInt(String(input.amountMinor)),
        probabilityBps: Number(input.probabilityBps ?? 10000),
        currency: String(input.currency),
        source: input.source as ForecastComponent["source"],
        sourceSnapshot: (input.sourceSnapshot ?? {}) as ForecastComponent["sourceSnapshot"],
        dimensions: (input.dimensions ?? {}) as ForecastComponent["dimensions"],
        ...(String(input.note ?? "").trim() ? { note: String(input.note) } : {}),
        createdBy: c.actorId,
      });
      await this.assertNoDoubleCount(q, component);
      await this.insert(q, component, String(input.reason));
      const auditEventId = await this.audit(
        q,
        c,
        component.id,
        "create",
        "1",
        String(input.reason),
      );
      return {
        resource: await this.getWith(q, c.organizationId, forecastId, component.id),
        mutation: this.meta(c, "1", auditEventId, false),
      };
    });
  }
  update(
    c: ForecastComponentContext,
    forecastId: string,
    id: string,
    input: Record<string, unknown>,
    key: string,
  ) {
    return this.mutate(
      c,
      key,
      "forecast-components:update",
      { forecastId, id, input },
      async (q) => {
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
      },
    );
  }
  remove(
    c: ForecastComponentContext,
    forecastId: string,
    id: string,
    input: Record<string, unknown>,
    key: string,
  ) {
    return this.mutate(
      c,
      key,
      "forecast-components:delete",
      { forecastId, id, input },
      async (q) => {
        await this.mutableParent(q, c.organizationId, forecastId);
        const raw = await this.lock(q, c.organizationId, forecastId, id);
        if (String(raw.version) !== String(input.expectedResourceVersion))
          throw new Error("VERSION_CONFLICT");
        const auditEventId = await this.audit(
          q,
          c,
          id,
          "delete",
          String(raw.version),
          String(input.reason),
        );
        await q.query(
          `delete from forecast_components where organization_id=$1 and forecast_version_id=$2 and id=$3`,
          [c.organizationId, forecastId, id],
        );
        return {
          resource: { schemaVersion: 1, id, forecastVersionId: forecastId, deleted: true },
          mutation: this.meta(c, String(raw.version), auditEventId, false),
        };
      },
    );
  }
  transition(
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
  async composition(c: ForecastComponentContext, forecastId: string) {
    const parent = await this.parent(this.pool, c.organizationId, forecastId);
    if (parent.state !== "draft" && parent.composition_snapshot) return parent.composition_snapshot;
    return this.compositionWith(this.pool, c.organizationId, forecastId, parent);
  }
  async compositionWith(
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
  private async insert(q: PoolClient, x: ForecastComponent, reason: string) {
    try {
      await q.query(
        `insert into forecast_components(organization_id,forecast_version_id,id,section,kind,amount_minor,direction,probability_bps,scheduled_on,source_type,source_id,commercial_root_type,commercial_root_id,source_identity_key,currency,source_snapshot,dimensions,note,reason,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
        [
          x.organizationId,
          x.forecastVersionId,
          x.id,
          x.section,
          x.kind,
          x.amountMinor,
          x.direction,
          x.probabilityBps,
          x.scheduledOn,
          x.source.type,
          x.source.id,
          x.source.commercialRootType ?? null,
          x.source.commercialRootId ?? null,
          `${x.source.commercialRootType ?? x.source.type}:${x.source.commercialRootId ?? x.source.id}`,
          x.currency,
          JSON.stringify(x.sourceSnapshot),
          JSON.stringify(x.dimensions),
          x.note ?? null,
          reason,
          x.createdBy,
        ],
      );
    } catch (error) {
      this.mapConstraint(error);
    }
  }
  private context(row: any): ForecastCompositionContext {
    return {
      organizationId: row.organization_id,
      forecastVersionId: row.id,
      forecastState: row.state,
      actualBasis: row.actual_basis,
      asOfDate: this.dateText(row.as_of_date),
      startsOn: this.dateText(row.starts_on),
      endsOn: this.dateText(row.ends_on),
      currency: row.currency,
      dimensions: {
        ...(row.team_id ? { teamId: row.team_id } : {}),
        ...(row.service_line_code ? { serviceLineCode: row.service_line_code } : {}),
        ...(row.owner_id ? { ownerId: row.owner_id } : {}),
      },
    };
  }
  private domain(row: any): ForecastComponent {
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
        row.kind !== "manual_adjustment"
          ? "not_required"
          : row.reviewed_by
            ? "reviewed"
            : "pending",
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
  private rowContract(row: any) {
    return {
      ...row,
      amountMinor: String(row.amount_minor),
      probabilityBps: row.probability_bps,
      scheduledOn: this.dateText(row.scheduled_on),
      sourceType: row.source_type,
      sourceId: row.source_id,
      commercialRootType: row.commercial_root_type,
      commercialRootId: row.commercial_root_id,
      sourceSnapshot: row.source_snapshot,
      dimensions: row.dimensions,
      createdBy: row.created_by,
      excluded: row.excluded,
      excludedBy: row.excluded_by,
      excludedAt: row.excluded_at?.toISOString?.() ?? row.excluded_at,
      exclusionReason: row.exclusion_reason,
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at?.toISOString?.() ?? row.reviewed_at,
      reviewReason: row.review_reason,
      resourceVersion: String(row.version),
    };
  }
  private select() {
    return `select id,forecast_version_id "forecastVersionId",section,kind,amount_minor::text "amountMinor",direction,probability_bps "probabilityBps",scheduled_on::text "scheduledOn",source_type "sourceType",source_id "sourceId",commercial_root_type "commercialRootType",commercial_root_id "commercialRootId",currency,source_snapshot "sourceSnapshot",dimensions,note,excluded,excluded_by "excludedBy",excluded_at::text "excludedAt",exclusion_reason "exclusionReason",reviewed_by "reviewedBy",reviewed_at::text "reviewedAt",review_reason "reviewReason",version::text "resourceVersion",created_by "createdBy" from forecast_components`;
  }
  private contract(row: any, mutable = true) {
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
  private async getWith(
    q: Pick<PoolClient, "query"> | pg.Pool,
    org: string,
    forecastId: string,
    id: string,
    mutable = true,
  ) {
    const row = (
      await q.query(
        `${this.select()} where organization_id=$1 and forecast_version_id=$2 and id=$3`,
        [org, forecastId, id],
      )
    ).rows[0];
    return row ? this.contract(row, mutable) : undefined;
  }
  private async parent(q: Pick<PoolClient, "query"> | pg.Pool, org: string, id: string) {
    const row = (
      await q.query(`select * from forecast_versions where organization_id=$1 and id=$2`, [org, id])
    ).rows[0];
    if (!row) throw new Error("RESOURCE_NOT_FOUND");
    return row;
  }
  private async mutableParent(q: PoolClient, org: string, id: string) {
    const row = (
      await q.query(
        `select * from forecast_versions where organization_id=$1 and id=$2 for update`,
        [org, id],
      )
    ).rows[0];
    if (!row) throw new Error("RESOURCE_NOT_FOUND");
    if (row.state !== "draft") throw new Error("FORECAST_VERSION_IMMUTABLE");
    return row;
  }
  private async lock(q: PoolClient, org: string, forecastId: string, id: string) {
    const row = (
      await q.query(
        `select * from forecast_components where organization_id=$1 and forecast_version_id=$2 and id=$3 for update`,
        [org, forecastId, id],
      )
    ).rows[0];
    if (!row) throw new Error("RESOURCE_NOT_FOUND");
    return row;
  }
  private async assertNoDoubleCount(q: PoolClient, x: ForecastComponent, excludingId?: string) {
    if (x.source.type === "manual") return;
    const row = (
      await q.query(
        `select id from forecast_components where organization_id=$1 and forecast_version_id=$2 and section=$3 and coalesce(commercial_root_type,source_type)=$4 and coalesce(commercial_root_id,source_id)=$5 and scheduled_on=$6 and excluded=false and ($7::text is null or id<>$7) limit 1`,
        [
          x.organizationId,
          x.forecastVersionId,
          x.section,
          x.source.commercialRootType ?? x.source.type,
          x.source.commercialRootId ?? x.source.id,
          x.scheduledOn,
          excludingId ?? null,
        ],
      )
    ).rows[0];
    if (row) throw new Error("FORECAST_COMMERCIAL_SOURCE_DUPLICATE");
  }
  private mapConstraint(error: unknown): never {
    if (
      (error as { constraint?: string }).constraint ===
      "forecast_component_commercial_root_date_unique"
    )
      throw new Error("FORECAST_COMMERCIAL_SOURCE_DUPLICATE");
    throw error;
  }
  private async actual(
    q: Pick<PoolClient, "query"> | pg.Pool,
    org: string,
    basis: string,
    cutoff: string,
    currency: string,
    startsOn: string,
  ) {
    let sql: string;
    if (basis === "recognized")
      sql = `select id,amount_minor::text amount from revenue_recognition_events where organization_id=$1 and state='posted' and effective_on between $4 and $2 and currency=$3`;
    else if (basis === "invoiced")
      sql = `select d.id,(case when d.type='credit_note' then -d.net_minor else d.net_minor end)::text amount from commercial_documents d left join commercial_documents original on original.organization_id=d.organization_id and original.id=d.original_document_id where d.organization_id=$1 and d.state in ('issued','posted','partially_paid','paid') and d.document_date between $4 and $2 and d.currency=$3 and (d.type='sales_invoice' or (d.type='credit_note' and original.type='sales_invoice'))`;
    else
      sql = `select a.id,(case when a.target_currency=$3 then a.target_amount_minor else a.base_amount_minor end)::text amount from reconciliation_allocations a join reconciliation_attempts ra on ra.organization_id=a.organization_id and ra.id=a.reconciliation_id join payment_reconciliations pr on pr.organization_id=ra.organization_id and pr.id=ra.reconciliation_id join bank_transactions bt on bt.organization_id=pr.organization_id and bt.id=pr.bank_transaction_id join commercial_documents d on d.organization_id=a.organization_id and d.id=a.commercial_document_id join organizations o on o.id=a.organization_id where a.organization_id=$1 and pr.direction='receipt' and ra.state='reconciled' and d.type='sales_invoice' and bt.booking_date between $4 and $2 and (a.target_currency=$3 or o.base_currency=$3)`;
    const rows = (await q.query(sql, [org, cutoff, currency, startsOn])).rows;
    return {
      amountMinor: rows.reduce((n, r) => n + BigInt(r.amount), 0n),
      ids: rows.map((r) => r.id),
    };
  }
  private dateText(v: unknown) {
    return v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
  }
  private meta(
    c: ForecastComponentContext,
    resourceVersion: string,
    auditEventId: string,
    replayed: boolean,
  ) {
    return {
      resourceVersion,
      auditEventId,
      correlationId: c.correlationId,
      idempotencyReplayed: replayed,
      nextActions: [],
    };
  }
  private async audit(
    q: PoolClient,
    c: ForecastComponentContext,
    id: string,
    action: string,
    version: string,
    reason: string,
  ) {
    const eventId = randomUUID();
    await q.query(
      `insert into planning_audit_events(organization_id,id,resource_type,resource_id,action,actor_id,reason,correlation_id,resource_version) values($1,$2,'forecast-components',$3,$4,$5,$6,$7,$8)`,
      [c.organizationId, eventId, id, action, c.actorId, reason, c.correlationId, version],
    );
    return eventId;
  }
  private async mutate(
    c: ForecastComponentContext,
    key: string,
    operation: string,
    input: unknown,
    work: (q: PoolClient) => Promise<any>,
  ) {
    const q = await this.pool.connect(),
      requestHash = hash(input);
    try {
      await q.query("begin");
      await q.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `${c.organizationId}:forecast-components:${key}`,
      ]);
      const old = (
        await q.query(
          `select operation,request_hash,response_body from api_idempotency_records where organization_id=$1 and idempotency_key=$2`,
          [c.organizationId, key],
        )
      ).rows[0];
      if (old) {
        if (old.operation !== operation || old.request_hash !== requestHash)
          throw new Error("Idempotency key was reused with a different request");
        await q.query("commit");
        const response = old.response_body;
        response.mutation = { ...response.mutation, idempotencyReplayed: true };
        return response;
      }
      const response = await work(q);
      await q.query(
        `insert into api_idempotency_records(organization_id,idempotency_key,operation,request_hash,response_body) values($1,$2,$3,$4,$5)`,
        [c.organizationId, key, operation, requestHash, JSON.stringify(response)],
      );
      await q.query("commit");
      return response;
    } catch (error) {
      await q.query("rollback");
      throw error;
    } finally {
      q.release();
    }
  }
}
