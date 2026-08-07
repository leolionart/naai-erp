import { Inject, Injectable } from "@nestjs/common";
import type { PortableRowEnvelopeContract, PortableRowIssueContract } from "@naai-erp/contracts";
import { CommercialDocumentService } from "../commercial-documents/commercial-document.service.js";
import type { UpdateCommercialDocumentInput } from "../commercial-documents/commercial-document.types.js";
import { ExpenseService } from "../expenses/expense.service.js";
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
const payload = (row: PortableRowEnvelopeContract) =>
  Object.fromEntries(
    [...Object.entries(row.data), ...Object.entries(row.relationships)].map(([key, value]) => [
      camel(key),
      value,
    ]),
  );

@Injectable()
export class PortableCanonicalMutationAdapter {
  constructor(
    @Inject(MasterDataService) private readonly masterData: MasterDataService,
    @Inject(CommercialDocumentService) private readonly documents: CommercialDocumentService,
    @Inject(ExpenseService) private readonly expenses: ExpenseService,
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
    if (row.operation === "reverse_replace")
      return invalid(
        "ATOMIC_REVERSE_REPLACE_UNAVAILABLE",
        `${resourceType} reversal and replacement are not exposed as one atomic application service`,
      );
    try {
      if (entry.adapter === "master_data") {
        const canonical = entry.canonicalResource!;
        const dryRun = this.masterData.dryRunImport(canonical, context, [
          { ...row.data, ...row.relationships },
        ]).data;
        const errors = dryRun?.rows[0]?.errors ?? [];
        return errors.length ? invalid("FIELD_INVALID", errors.join("; ")) : ready(row);
      }
      if (entry.adapter === "commercial_document") {
        const current = (await this.documents.get(context, row.stableId!)) as {
          data: { state: string; version: string | number | bigint };
        };
        if (String(current.data.version) !== row.expectedResourceVersion)
          return invalid("VERSION_CONFLICT", "Commercial document version is stale");
        if (row.operation === "update" && current.data.state !== "draft")
          return invalid("STATE_CONFLICT", "Only draft commercial documents can be updated");
        return ready(row);
      }
      if (entry.adapter === "expense") {
        const current = (await this.expenses.get(context, row.stableId!)) as {
          data: { state: string; version: string | number | bigint };
        };
        if (String(current.data.version) !== row.expectedResourceVersion)
          return invalid("VERSION_CONFLICT", "Expense version is stale");
        if (row.operation === "update" && current.data.state !== "draft")
          return invalid("STATE_CONFLICT", "Only draft expenses can be updated");
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
        const data = { ...row.data, ...row.relationships } as Record<string, unknown>;
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
        if (row.operation === "cancel") {
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
        if (row.operation === "cancel") {
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
