import { randomUUID } from "node:crypto";
import { Inject, Injectable, Optional } from "@nestjs/common";
import type { PortableRowEnvelopeContract, PortableRowIssueContract } from "@naai-erp/contracts";
import { CommercialDocumentService } from "../commercial-documents/commercial-document.service.js";
import type { UpdateCommercialDocumentInput } from "../commercial-documents/commercial-document.types.js";
import { ExpenseService } from "../expenses/expense.service.js";
import { CustomerServiceSubscriptionService } from "../customer-service-subscriptions/customer-service-subscription.service.js";
import type { CreateExpenseInput } from "../expenses/expense.types.js";
import { MasterDataService } from "../master-data/master-data.service.js";
import { MASTER_DATA_RESOURCES, encodeResourceKey } from "../master-data/resource-registry.js";
import type { PortableDataPackageContext } from "./portable-data-package.types.js";
import type {
  PortableCanonicalApplyResult,
  PortableCanonicalRowValidation,
} from "./portable-data-import.types.js";
import { portableMutationEntry } from "./portable-resource-mutation-matrix.js";

const problem = (code: string, message: string, field?: string): PortableRowIssueContract => ({
  code,
  message,
  ...(field ? { field } : {}),
  severity: "error",
});
const ready = (row: PortableRowEnvelopeContract): PortableCanonicalRowValidation => ({
  disposition: "ready",
  resolvedReferences: Object.fromEntries(
    Object.entries(row.relationships).filter(
      (entry): entry is [string, string] => entry[1] != null,
    ),
  ),
});
const invalid = (
  code: string,
  message: string,
  field?: string,
): PortableCanonicalRowValidation => ({
  disposition: code.includes("VERSION") || code.includes("STATE") ? "conflict" : "invalid",
  issues: [problem(code, message, field)],
});
const camel = (key: string) =>
  key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
const decoded = (key: string, value: unknown) => {
  if (key === "fiscal_year" && typeof value === "string" && /^\d+$/.test(value))
    return Number(value);
  if (["lines", "evidence_checklist"].includes(key) && typeof value === "string") {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  }
  return value;
};
const payload = (row: PortableRowEnvelopeContract) => ({
  ...Object.fromEntries(
    [...Object.entries(row.data), ...Object.entries(row.relationships)].map(([key, value]) => [
      camel(key),
      decoded(key, value),
    ]),
  ),
  ...(row.externalReferences[0] ? { externalReference: row.externalReferences[0] } : {}),
});
const masterPayload = (
  definition: (typeof MASTER_DATA_RESOURCES)[keyof typeof MASTER_DATA_RESOURCES],
  row: PortableRowEnvelopeContract,
) => {
  const source = { ...row.data, ...row.relationships } as Record<string, unknown>;
  const allowed = new Set(definition.writableColumns);
  const data = Object.fromEntries(
    Object.entries(source).filter(([key, value]) => allowed.has(key as never) && value != null),
  );
  for (const key of definition.keyColumns)
    if (data[key] == null && key === "id") data[key] = row.stableId ?? randomUUID();
  return data;
};
const subscriptionPayload = (resourceType: string, row: PortableRowEnvelopeContract) => {
  const source = { ...row.data, ...row.relationships } as Record<string, unknown>;
  const recurrence = {
    frequency: source.recurrence_frequency,
    interval: Number(source.recurrence_interval),
    billingDay: Number(source.billing_day),
  };
  if (resourceType === "service_plans")
    return {
      schemaVersion: 1,
      ...(row.stableId ? { id: row.stableId } : {}),
      code: source.code,
      name: source.name,
      serviceLineCode: source.service_line_code,
      defaultUnitPriceMinor: String(source.default_unit_price_minor ?? ""),
      currency: source.currency,
      recurrence,
      reason: String(source.reason ?? "Portable data package import"),
      ...(row.expectedResourceVersion
        ? { expectedResourceVersion: row.expectedResourceVersion }
        : {}),
    };
  return {
    schemaVersion: 1,
    ...(row.stableId ? { id: row.stableId } : {}),
    customerPartyId: source.customer_party_id,
    servicePlanId: source.service_plan_id,
    projectId: source.project_id ?? null,
    startsOn: source.starts_on,
    endsOn: source.ends_on ?? null,
    quantity: String(source.quantity ?? ""),
    unitPriceMinor: String(source.unit_price_minor ?? ""),
    currency: source.currency,
    recurrence,
    reason: String(source.reason ?? "Portable data package import"),
    ...(row.expectedResourceVersion
      ? { expectedResourceVersion: row.expectedResourceVersion }
      : {}),
  };
};

@Injectable()
export class PortableCanonicalMutationAdapter {
  constructor(
    @Inject(MasterDataService) private readonly masterData: MasterDataService,
    @Inject(CommercialDocumentService) private readonly documents: CommercialDocumentService,
    @Inject(ExpenseService) private readonly expenses: ExpenseService,
    @Optional()
    @Inject(CustomerServiceSubscriptionService)
    private readonly subscriptions?: CustomerServiceSubscriptionService,
  ) {}

  private requireIdentity(row: PortableRowEnvelopeContract) {
    if (!row.stableId) return invalid("STABLE_ID_REQUIRED", "Existing resources require stableId");
    if (!row.expectedResourceVersion)
      return invalid("VERSION_REQUIRED", "Existing resources require expectedResourceVersion");
    return undefined;
  }

  async validate(
    context: PortableDataPackageContext,
    resourceType: string,
    row: PortableRowEnvelopeContract,
  ): Promise<PortableCanonicalRowValidation> {
    const entry = portableMutationEntry(resourceType);
    if (!entry.operations.includes(row.operation as never))
      return invalid(
        "OPERATION_NOT_ALLOWED",
        `${row.operation} is not allowed for ${resourceType}; allowed: ${entry.operations.join(", ") || "none"}`,
      );
    if (row.operation !== "create") {
      const identity = this.requireIdentity(row);
      if (identity) return identity;
    }
    try {
      if (entry.adapter === "master_data") {
        const canonical = entry.canonicalResource!;
        const definition = MASTER_DATA_RESOURCES[canonical as keyof typeof MASTER_DATA_RESOURCES];
        const dryRun = this.masterData.dryRunImport(canonical, context, [
          masterPayload(definition, row),
        ]).data;
        const errors = dryRun?.rows[0]?.errors ?? [];
        return errors.length ? invalid("FIELD_INVALID", errors.join("; ")) : ready(row);
      }
      if (entry.adapter === "commercial_document") {
        if (row.operation === "create") {
          this.documents.validatePortableInput(payload(row) as never);
          return ready(row);
        }
        const current = (await this.documents.get(context, row.stableId!)) as {
          data: { state: string; version: string | number | bigint };
        };
        if (String(current.data.version) !== row.expectedResourceVersion)
          return invalid("VERSION_CONFLICT", "Commercial document version is stale");
        if (row.operation === "update" && current.data.state !== "draft")
          return invalid("STATE_CONFLICT", "Only draft commercial documents can be updated");
        if (
          row.operation === "reverse_replace" &&
          !["issued", "posted", "partially_paid", "paid"].includes(current.data.state)
        )
          return invalid("STATE_CONFLICT", "Only issued or posted documents can be replaced");
        return ready(row);
      }
      if (entry.adapter === "expense") {
        if (row.operation === "create") {
          this.expenses.validatePortableInput(payload(row) as never);
          return ready(row);
        }
        const current = (await this.expenses.get(context, row.stableId!)) as {
          data: { state: string; version: string | number | bigint };
        };
        if (String(current.data.version) !== row.expectedResourceVersion)
          return invalid("VERSION_CONFLICT", "Expense version is stale");
        if (row.operation === "update" && current.data.state !== "draft")
          return invalid("STATE_CONFLICT", "Only draft expenses can be updated");
        if (row.operation === "reverse_replace" && current.data.state !== "posted")
          return invalid("STATE_CONFLICT", "Only posted expenses can be replaced");
        return ready(row);
      }
      if (entry.adapter === "customer_subscription") {
        if (!this.subscriptions)
          return invalid(
            "CANONICAL_SERVICE_UNAVAILABLE",
            "Customer subscription canonical service is unavailable",
          );
        const input = subscriptionPayload(resourceType, row);
        if (row.operation === "create") {
          await this.subscriptions.validatePortableInput(
            context,
            resourceType as "service_plans" | "customer_service_subscriptions",
            input,
          );
          return ready(row);
        }
        const current =
          resourceType === "service_plans"
            ? await this.subscriptions.getPlan(context, row.stableId!)
            : await this.subscriptions.getSubscription(context, row.stableId!);
        const resource = (current as { data: Record<string, unknown> }).data;
        if (String(resource.resourceVersion) !== row.expectedResourceVersion)
          return invalid("VERSION_CONFLICT", `${resourceType} version is stale`);
        if (
          resourceType === "customer_service_subscriptions" &&
          row.operation === "update" &&
          resource.lifecycle !== "draft"
        )
          return invalid("STATE_CONFLICT", "Only draft subscriptions can be updated");
        if (!input.reason) return invalid("FIELD_INVALID", "reason is required", "reason");
        return ready(row);
      }
      return invalid("READ_ONLY_RESOURCE", entry.reason ?? `${resourceType} is read-only`);
    } catch (error) {
      return invalid(
        "CANONICAL_VALIDATION_FAILED",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  async apply(
    context: PortableDataPackageContext,
    resourceType: string,
    row: PortableRowEnvelopeContract,
    idempotencyKey: string,
  ): Promise<PortableCanonicalApplyResult> {
    const validation = await this.validate(context, resourceType, row);
    if (validation.disposition !== "ready")
      return {
        applied: false,
        issue: validation.issues?.[0] ?? problem("ROW_INVALID", "Row is not ready"),
      };
    const entry = portableMutationEntry(resourceType);
    try {
      if (entry.adapter === "master_data") {
        const canonical = entry.canonicalResource!;
        const definition = MASTER_DATA_RESOURCES[canonical as keyof typeof MASTER_DATA_RESOURCES];
        const data = masterPayload(definition, row);
        const keyValues = Object.fromEntries(
          definition.keyColumns.map((key) => [
            key,
            data[key] ?? (key === "id" ? row.stableId : undefined),
          ]),
        );
        const action =
          row.operation === "create"
            ? "create"
            : row.operation === "deactivate"
              ? "deactivate"
              : "update";
        const response = await this.masterData.mutate(
          action,
          canonical,
          action === "create" ? undefined : encodeResourceKey(keyValues),
          context,
          {
            data,
            ...(row.expectedResourceVersion
              ? { expectedVersion: row.expectedResourceVersion }
              : {}),
          },
          idempotencyKey,
        );
        return {
          applied: true,
          stableId: String(response.data?.resource.id ?? row.stableId ?? ""),
        };
      }
      if (entry.adapter === "commercial_document") {
        if (row.operation === "create") {
          const response = await this.documents.create(
            context,
            { ...payload(row), ...(row.stableId ? { id: row.stableId } : {}) } as never,
            idempotencyKey,
          );
          return {
            applied: true,
            stableId: String((response as { data: { documentId: string } }).data.documentId),
          };
        } else if (row.operation === "reverse_replace") {
          const response = await this.documents.reverseReplace(
            context,
            row.stableId!,
            row.expectedResourceVersion!,
            {
              ...payload(row),
              ...(row.data.replacementId ? { id: String(row.data.replacementId) } : {}),
            } as never,
            String(row.data.reason ?? "Portable package correction"),
            idempotencyKey,
          );
          return {
            applied: true,
            stableId: String(
              (response as { data: { replacementDocumentId: string } }).data.replacementDocumentId,
            ),
          };
        } else if (row.operation === "cancel") {
          await this.documents.transition(
            context,
            row.stableId!,
            "cancel",
            { reason: String(row.data.reason ?? "Portable package correction") },
            idempotencyKey,
          );
        } else {
          await this.documents.update(
            context,
            row.stableId!,
            row.expectedResourceVersion!,
            payload(row) as UpdateCommercialDocumentInput,
            idempotencyKey,
          );
        }
        return row.stableId ? { applied: true, stableId: row.stableId } : { applied: true };
      }
      if (entry.adapter === "expense") {
        if (row.operation === "create") {
          const response = await this.expenses.create(
            context,
            { ...payload(row), ...(row.stableId ? { id: row.stableId } : {}) } as never,
            idempotencyKey,
          );
          return {
            applied: true,
            stableId: String((response as { data: { expenseId: string } }).data.expenseId),
          };
        } else if (row.operation === "reverse_replace") {
          const response = await this.expenses.reverseReplace(
            context,
            row.stableId!,
            row.expectedResourceVersion!,
            {
              ...payload(row),
              ...(row.data.replacementId ? { id: String(row.data.replacementId) } : {}),
            } as never,
            String(row.data.reason ?? "Portable package correction"),
            idempotencyKey,
          );
          return {
            applied: true,
            stableId: String(
              (response as { data: { replacementExpenseId: string } }).data.replacementExpenseId,
            ),
          };
        } else if (row.operation === "cancel") {
          await this.expenses.transition(
            context,
            row.stableId!,
            "cancel",
            { reason: String(row.data.reason ?? "Portable package correction") },
            idempotencyKey,
          );
        } else {
          await this.expenses.update(
            context,
            row.stableId!,
            row.expectedResourceVersion!,
            payload(row) as Partial<CreateExpenseInput>,
            idempotencyKey,
          );
        }
        return row.stableId ? { applied: true, stableId: row.stableId } : { applied: true };
      }
      if (entry.adapter === "customer_subscription") {
        if (!this.subscriptions)
          return {
            applied: false,
            issue: problem(
              "CANONICAL_SERVICE_UNAVAILABLE",
              "Customer subscription canonical service is unavailable",
            ),
          };
        const input = subscriptionPayload(resourceType, row);
        if (resourceType === "service_plans") {
          const response =
            row.operation === "create"
              ? await this.subscriptions.createPlan(context, input, idempotencyKey)
              : row.operation === "deactivate"
                ? await this.subscriptions.deactivatePlan(
                    context,
                    row.stableId!,
                    input,
                    idempotencyKey,
                  )
                : await this.subscriptions.updatePlan(
                    context,
                    row.stableId!,
                    input,
                    idempotencyKey,
                  );
          const resource = (response as { data: { resource: { id: string } } }).data.resource;
          return { applied: true, stableId: resource.id };
        }
        const response =
          row.operation === "create"
            ? await this.subscriptions.createSubscription(context, input, idempotencyKey)
            : row.operation === "cancel"
              ? await this.subscriptions.transition(
                  context,
                  row.stableId!,
                  "cancel",
                  {
                    schemaVersion: 1,
                    expectedResourceVersion: row.expectedResourceVersion,
                    effectiveOn: String(row.data.lifecycle_effective_on ?? row.data.ends_on),
                    reason: String(row.data.reason ?? "Portable data package cancellation"),
                  },
                  idempotencyKey,
                )
              : await this.subscriptions.updateSubscription(
                  context,
                  row.stableId!,
                  input,
                  idempotencyKey,
                );
        let resource = (
          response as {
            data: { resource: { id: string; resourceVersion: string; lifecycle: string } };
          }
        ).data.resource;
        if (row.operation === "create") {
          const desired = String(row.data.lifecycle ?? "draft");
          const effectiveOn = String(
            row.data.lifecycle_effective_on ?? row.data.ends_on ?? row.data.starts_on,
          );
          const transition = async (action: "activate" | "pause" | "cancel" | "expire") => {
            const transitioned = await this.subscriptions!.transition(
              context,
              resource.id,
              action,
              {
                schemaVersion: 1,
                expectedResourceVersion: resource.resourceVersion,
                effectiveOn,
                reason: String(row.data.lifecycle_reason ?? "Portable data package restore"),
              },
              `${idempotencyKey}:${action}`,
            );
            resource = (
              transitioned as {
                data: { resource: typeof resource };
              }
            ).data.resource;
          };
          if (["active", "paused", "expired"].includes(desired)) await transition("activate");
          if (desired === "paused") await transition("pause");
          if (desired === "cancelled") await transition("cancel");
          if (desired === "expired") await transition("expire");
        }
        return { applied: true, stableId: resource.id };
      }
      return {
        applied: false,
        issue: problem("READ_ONLY_RESOURCE", `${resourceType} is read-only`),
      };
    } catch (error) {
      return {
        applied: false,
        issue: problem(
          "CANONICAL_MUTATION_FAILED",
          error instanceof Error ? error.message : String(error),
        ),
      };
    }
  }
}
