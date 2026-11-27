/* eslint-disable @typescript-eslint/no-explicit-any -- PostgreSQL rows are normalized at the store boundary. */
import { randomUUID } from "node:crypto";
import {
  createForecastVersion,
  createRevenueTargetVersion,
  publishRevenueTargetVersion,
  type ForecastVersion,
  type RevenueTargetVersion,
} from "@naai-erp/domain";
import type { PlanningContext, PlanningResource } from "./planning.types.js";
import {
  canSelfApprove,
  resolveOrganizationWorkflowPolicy,
} from "../workflow-policy/organization-workflow-policy.service.js";
import type { PgPlanningStore } from "./pg-planning.store.js";

export function createOperation(
  this: PgPlanningStore,
  c: PlanningContext,
  resource: PlanningResource,
  input: Record<string, unknown>,
  key: string,
) {
  return this.mutate(c, key, `${resource}:create`, input, async (q) => {
    const id = String(input.id ?? randomUUID());
    const existing = await this.existing(q, c.organizationId, resource);
    if (resource === "revenue-targets") {
      const target = createRevenueTargetVersion({
        organizationId: c.organizationId,
        id,
        versionNumber: Number(input.versionNumber),
        ...(input.previousVersionId ? { previousVersionId: String(input.previousVersionId) } : {}),
        periodKind: input.periodKind as any,
        startsOn: String(input.startsOn),
        endsOn: String(input.endsOn),
        actualBasis: input.actualBasis as any,
        currency: String(input.currency),
        amountMinor: BigInt(String(input.amountMinor)),
        dimensions: this.dimensions(input.dimensions),
      });
      const { assertRevenueTargetVersionSequence } = await import("@naai-erp/domain");
      assertRevenueTargetVersionSequence(target, existing as RevenueTargetVersion[]);
      await q.query(
        `insert into revenue_target_versions(organization_id,id,version_number,previous_version_id,period_kind,starts_on,ends_on,actual_basis,currency,amount_minor,team_id,service_line_code,owner_id,reason,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          c.organizationId,
          id,
          target.versionNumber,
          target.previousVersionId ?? null,
          target.periodKind,
          target.startsOn,
          target.endsOn,
          target.actualBasis,
          target.currency,
          target.amountMinor,
          target.dimensions.teamId ?? null,
          target.dimensions.serviceLineCode ?? null,
          target.dimensions.ownerId ?? null,
          input.reason,
          c.actorId,
        ],
      );
      const policy = await resolveOrganizationWorkflowPolicy(c.organizationId, q);
      if (canSelfApprove({ policy, roles: c.roles })) {
        const published = publishRevenueTargetVersion(
          target,
          existing as RevenueTargetVersion[],
          c.actorId,
          new Date().toISOString(),
        );
        await q.query(
          `update revenue_target_versions set state='published',version=2,published_by=$3,published_at=$4,updated_at=now() where organization_id=$1 and id=$2`,
          [c.organizationId, id, published.publishedBy, published.publishedAt],
        );
        if (target.previousVersionId)
          await q.query(
            `update revenue_target_versions set state='superseded',version=version+1,updated_at=now() where organization_id=$1 and id=$2 and state='published'`,
            [c.organizationId, target.previousVersionId],
          );
      }
    } else {
      const forecast = createForecastVersion({
        organizationId: c.organizationId,
        id,
        versionNumber: Number(input.versionNumber),
        ...(input.previousVersionId ? { previousVersionId: String(input.previousVersionId) } : {}),
        scenario: input.scenario as any,
        ...(input.customScenarioName
          ? { customScenarioName: String(input.customScenarioName) }
          : {}),
        snapshotKind: input.snapshotKind as any,
        asOfDate: String(input.asOfDate),
        startsOn: String(input.startsOn),
        endsOn: String(input.endsOn),
        actualBasis: input.actualBasis as any,
        currency: String(input.currency),
        dimensions: this.dimensions(input.dimensions),
      });
      const { assertForecastVersionSequence } = await import("@naai-erp/domain");
      assertForecastVersionSequence(forecast, existing as ForecastVersion[]);
      await q.query(
        `insert into forecast_versions(organization_id,id,version_number,previous_version_id,scenario,custom_scenario_name,snapshot_kind,as_of_date,starts_on,ends_on,actual_basis,currency,team_id,service_line_code,owner_id,reason,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          c.organizationId,
          id,
          forecast.versionNumber,
          forecast.previousVersionId ?? null,
          forecast.scenario,
          forecast.customScenarioName ?? null,
          forecast.snapshotKind,
          forecast.asOfDate,
          forecast.startsOn,
          forecast.endsOn,
          forecast.actualBasis,
          forecast.currency,
          forecast.dimensions.teamId ?? null,
          forecast.dimensions.serviceLineCode ?? null,
          forecast.dimensions.ownerId ?? null,
          input.reason,
          c.actorId,
        ],
      );
    }
    const createdResource = await this.getWith(q, c.organizationId, resource, id);
    const automaticallyPublished = createdResource?.state === "published";
    const resourceVersion = createdResource?.resourceVersion ?? "1";
    const auditEventId = await this.audit(
      q,
      c,
      resource,
      id,
      automaticallyPublished ? "create_and_publish" : "create",
      resourceVersion,
      String(input.reason),
    );
    return {
      resource: createdResource,
      mutation: this.meta(c, resourceVersion, auditEventId, false),
    };
  });
}
