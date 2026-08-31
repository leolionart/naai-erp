import { Inject, Injectable } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { API_VERSION } from "@naai-erp/contracts";
import { MasterDataService } from "../master-data/master-data.service.js";
import { PgCommercialDocumentStore } from "./pg-commercial-document.store.js";
import type {
  CommercialDocumentAction,
  CommercialDocumentCategoryInput,
  CommercialDocumentMetadataInput,
  CommercialDocumentContext,
  CommercialDocumentTaxReviewInput,
  CommercialDocumentTaxCodeCorrectionInput,
  CommercialDocumentLineInput,
  CreateCommercialDocumentInput,
  DocumentAllocationInput,
  UpdateCommercialDocumentInput,
  ExternalReferenceInput,
} from "./commercial-document.types.js";

const WRITE_ROLES = new Set(["owner", "finance_admin", "accountant", "integration"]);
const APPROVE_ROLES = new Set(["owner", "finance_admin", "accountant", "approver"]);
const POST_ROLES = new Set(["owner", "finance_admin", "accountant"]);

interface ExistingDocument {
  type: string;
  document_number: string;
  series: string | null;
  fiscal_year: number;
  party_id: string;
  document_date: Date | string;
  due_date: Date | string;
  currency: string;
  net_minor: string | number;
  tax_minor: string | number;
  gross_minor: string | number;
  control_account_code: string;
  funding_financial_account_id: string | null;
  original_document_id: string | null;
  reason: string | null;
  externalReference?: {
    system: string;
    externalId: string;
    canonicalUrl?: string;
    checksum?: string;
    version?: string;
    metadata?: Record<string, unknown>;
  } | null;
  lines: Array<{
    lineNumber: number;
    originalLineNumber?: number;
    description: string;
    quantity: string | number;
    unitPriceMinor: string | number;
    netMinor: string | number;
    taxMinor: string | number;
    grossMinor: string | number;
    primaryAccountCode: string;
    categoryCode?: string;
    taxAccountCode?: string;
    taxCode?: string;
    dimensions?: Record<string, string>;
    allocations: Array<{
      id?: string;
      amount_minor: string | number;
      dimensions?: Record<string, string>;
    }>;
  }>;
}

@Injectable()
export class CommercialDocumentService {
  constructor(
    @Inject(PgCommercialDocumentStore) private readonly store: PgCommercialDocumentStore,
    @Inject(MasterDataService) private readonly masterData: MasterDataService,
  ) {}
  authenticate(authorization: string | undefined, organizationId: string, correlationId: string) {
    return this.masterData.authenticate(authorization, organizationId, correlationId);
  }
  private envelope(context: CommercialDocumentContext, data: unknown) {
    return {
      apiVersion: API_VERSION,
      requestId: context.correlationId,
      organizationId: context.organizationId,
      data,
    };
  }
  async list(
    context: CommercialDocumentContext,
    type?: string,
    state?: string,
    partyId?: string,
    projectId?: string,
    startsOn?: string,
    endsOn?: string,
  ) {
    return this.envelope(context, {
      items: await this.store.list(context.organizationId, {
        ...(type ? { type } : {}),
        ...(state ? { state } : {}),
        ...(partyId ? { partyId } : {}),
        ...(projectId ? { projectId } : {}),
        ...(startsOn ? { startsOn } : {}),
        ...(endsOn ? { endsOn } : {}),
      }),
    });
  }
  async get(context: CommercialDocumentContext, id: string) {
    const item = await this.store.get(context.organizationId, id);
    if (!item) throw new Error("RESOURCE_NOT_FOUND");
    return this.envelope(context, item);
  }
  async relationshipBackfillInventory(context: CommercialDocumentContext) {
    return this.envelope(context, {
      items: await this.store.relationshipBackfillInventory(context.organizationId),
    });
  }
  async dryRunRelationshipBackfill(
    context: CommercialDocumentContext,
    id: string,
    expectedVersion: string,
    replacement: CreateCommercialDocumentInput,
    reason: string,
  ) {
    if (!context.roles.some((role) => POST_ROLES.has(role))) throw new Error("FORBIDDEN");
    if (!expectedVersion) throw new Error("VERSION_CONFLICT");
    if (!reason.trim()) throw new Error("VALIDATION_FAILED");
    const existing = await this.store.get(context.organizationId, id);
    if (!existing) throw new Error("RESOURCE_NOT_FOUND");
    if (String(existing.version) !== expectedVersion) throw new Error("VERSION_CONFLICT");
    if (!["issued", "posted", "partially_paid", "paid"].includes(existing.state))
      throw new Error("INVALID_DOCUMENT_TRANSITION");
    const normalized = this.normalizeRelationships(replacement);
    this.validate(normalized);
    await this.store.validateRelationships?.(context.organizationId, normalized);
    const planHash = createHash("sha256")
      .update(
        JSON.stringify({ id, expectedVersion, replacement: normalized, reason: reason.trim() }),
      )
      .digest("hex");
    return this.envelope(context, {
      dryRun: true,
      planHash,
      originalId: id,
      originalState: existing.state,
      replacement: normalized,
      effects: ["partially_paid", "paid"].includes(existing.state)
        ? ["update_project_metadata_only", "preserve_payment_settlement", "preserve_journal"]
        : ["reverse_original_journal", "cancel_original", "create_replacement_draft"],
    });
  }
  async update(
    context: CommercialDocumentContext,
    id: string,
    expectedVersion: string,
    input: UpdateCommercialDocumentInput,
    idempotencyKey?: string,
  ) {
    if (!context.roles.some((role) => WRITE_ROLES.has(role))) throw new Error("FORBIDDEN");
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    if (!expectedVersion) throw new Error("VERSION_CONFLICT");

    const existing = await this.store.get(context.organizationId, id);
    if (!existing) throw new Error("RESOURCE_NOT_FOUND");
    if (existing.state !== "draft") throw new Error("INVALID_STATE_TRANSITION");
    if (existing.version.toString() !== expectedVersion) throw new Error("VERSION_CONFLICT");

    const merged = this.normalizeRelationships(this.mergeDocument(existing, input));
    this.validate(merged);
    await this.store.validateRelationships?.(context.organizationId, merged);

    return this.envelope(
      context,
      await this.store.update(context, id, expectedVersion, merged, idempotencyKey),
    );
  }
  async review(
    context: CommercialDocumentContext,
    id: string,
    input: CommercialDocumentTaxReviewInput,
    idempotencyKey?: string,
  ) {
    if (!context.roles.some((role) => POST_ROLES.has(role) || role === "approver"))
      throw new Error("FORBIDDEN");
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    if (
      !Number.isInteger(input.lineNumber) ||
      input.lineNumber < 1 ||
      !input.reason?.trim() ||
      (input.taxCode !== undefined && !input.taxCode.trim())
    )
      throw new Error("VALIDATION_FAILED");
    if (input.state === "accountant_override" && !input.reference?.trim())
      throw new Error("ACCOUNTANT_OVERRIDE_REFERENCE_REQUIRED");
    return this.envelope(context, await this.store.review(context, id, input, idempotencyKey));
  }
  async resolveTaxCode(
    context: CommercialDocumentContext,
    id: string,
    input: CommercialDocumentTaxCodeCorrectionInput,
    idempotencyKey?: string,
  ) {
    if (!context.roles.some((role) => POST_ROLES.has(role) || role === "approver"))
      throw new Error("FORBIDDEN");
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    if (!Number.isInteger(input.lineNumber) || input.lineNumber < 1 || !input.reason?.trim())
      throw new Error("VALIDATION_FAILED");
    return this.envelope(
      context,
      await this.store.resolveTaxCode(context, id, input, idempotencyKey),
    );
  }
  async updateCategory(
    context: CommercialDocumentContext,
    id: string,
    input: CommercialDocumentCategoryInput,
    idempotencyKey?: string,
  ) {
    if (!context.roles.some((role) => WRITE_ROLES.has(role))) throw new Error("FORBIDDEN");
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    const category = input.category?.trim();
    if (!category) throw new Error("VALIDATION_FAILED");
    return this.envelope(
      context,
      await this.store.updateCategory(context, id, category, idempotencyKey),
    );
  }
  async updateMetadata(
    context: CommercialDocumentContext,
    id: string,
    expectedVersion: string,
    input: CommercialDocumentMetadataInput,
    idempotencyKey?: string,
  ) {
    if (!context.roles.some((role) => WRITE_ROLES.has(role))) throw new Error("FORBIDDEN");
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    if (!expectedVersion) throw new Error("VERSION_CONFLICT");
    const normalized: CommercialDocumentMetadataInput = {
      ...(Object.prototype.hasOwnProperty.call(input, "partyId")
        ? { partyId: input.partyId === null ? null : input.partyId!.trim() }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(input, "projectId")
        ? { projectId: input.projectId === null ? null : input.projectId!.trim() }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(input, "category")
        ? { category: input.category === null ? null : input.category!.trim() }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(input, "description")
        ? input.description == null
          ? {}
          : { description: input.description.trim() }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(input, "reason")
        ? input.reason == null
          ? {}
          : { reason: input.reason.trim() }
        : {}),
    };
    if (
      !Object.keys(normalized).length ||
      Object.values(normalized).some((value) => value === "" || value === undefined)
    )
      throw new Error("VALIDATION_FAILED");
    return this.envelope(
      context,
      await this.store.updateMetadata(context, id, expectedVersion, normalized, idempotencyKey),
    );
  }
  async correct(
    context: CommercialDocumentContext,
    id: string,
    expectedVersion: string,
    input: { category?: string; funding?: unknown; reason: string },
    key?: string,
  ) {
    if (!input.reason?.trim()) throw new Error("VALIDATION_FAILED");
    const doc = await this.store.get(context.organizationId, id);
    if (!doc) throw new Error("RESOURCE_NOT_FOUND");
    if (input.funding) throw new Error("FUNDING_CORRECTION_REQUIRES_REPLACEMENT");
    return this.updateMetadata(
      context,
      id,
      expectedVersion,
      {
        ...(input.category !== undefined ? { category: input.category } : {}),
        reason: input.reason,
      },
      key,
    );
  }
  async deleteDraft(
    context: CommercialDocumentContext,
    id: string,
    expectedVersion?: string,
    reason?: string,
    idempotencyKey?: string,
  ) {
    if (!context.roles.some((role) => WRITE_ROLES.has(role))) throw new Error("FORBIDDEN");
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    if (!expectedVersion) throw new Error("IF_MATCH_REQUIRED");
    if (!reason?.trim()) throw new Error("DELETE_REASON_REQUIRED");
    return this.envelope(
      context,
      await this.store.deleteDraft(context, id, expectedVersion, reason.trim(), idempotencyKey),
    );
  }

  private mergeDocument(
    existing: ExistingDocument,
    input: UpdateCommercialDocumentInput,
  ): CreateCommercialDocumentInput {
    const formatDate = (d: Date | string | null | undefined) =>
      d instanceof Date
        ? d.toISOString().slice(0, 10)
        : typeof d === "string"
          ? d.slice(0, 10)
          : String(d);

    const existingLines = (existing.lines || []).map((l) => {
      const allocations = (l.allocations || []).map((a) => {
        const { allocationId, ...restDims } = a.dimensions || {};
        return {
          id: allocationId || a.id || randomUUID(),
          amountMinor: String(a.amount_minor),
          dimensions: restDims as Record<string, string>,
        };
      });
      const originalLineVal = l.lineNumber || l.originalLineNumber;
      const line: CreateCommercialDocumentInput["lines"][number] = {
        description: l.description,
        quantity: String(l.quantity),
        unitPriceMinor: String(l.unitPriceMinor),
        netMinor: String(l.netMinor),
        taxMinor: String(l.taxMinor),
        grossMinor: String(l.grossMinor),
        primaryAccountCode: l.primaryAccountCode,
        dimensions: {
          ...(l.dimensions || {}),
          ...(l.categoryCode ? { category: l.categoryCode } : {}),
        },
        allocations,
        ...(typeof originalLineVal === "number" ? { originalLineNumber: originalLineVal } : {}),
        ...(l.taxAccountCode ? { taxAccountCode: l.taxAccountCode } : {}),
        ...(l.taxCode ? { taxCode: l.taxCode } : {}),
      };
      return line;
    });

    const mergedExtRef =
      input.externalReference !== undefined
        ? input.externalReference || undefined
        : existing.externalReference
          ? {
              system: existing.externalReference.system,
              externalId: existing.externalReference.externalId,
              canonicalUrl: existing.externalReference.canonicalUrl || undefined,
              checksum: existing.externalReference.checksum || undefined,
              version: existing.externalReference.version || undefined,
              metadata: existing.externalReference.metadata,
            }
          : undefined;

    const seriesVal = input.series !== undefined ? input.series : existing.series;
    const origId =
      input.originalDocumentId !== undefined
        ? input.originalDocumentId
        : existing.original_document_id;
    const reasonVal = input.reason !== undefined ? input.reason : existing.reason;

    const fundingAccountId = input.funding
      ? input.funding.type === "owner_paid"
        ? undefined
        : input.funding.financialAccountId
      : (input.fundingSource?.financialAccountId ??
        existing.funding_financial_account_id ??
        undefined);

    let cleanedExtRef: ExternalReferenceInput | undefined = undefined;
    if (mergedExtRef) {
      cleanedExtRef = {
        system: mergedExtRef.system,
        externalId: mergedExtRef.externalId,
        ...(mergedExtRef.canonicalUrl ? { canonicalUrl: mergedExtRef.canonicalUrl } : {}),
        ...(mergedExtRef.checksum ? { checksum: mergedExtRef.checksum } : {}),
        ...(mergedExtRef.version ? { version: mergedExtRef.version } : {}),
        ...(mergedExtRef.metadata ? { metadata: mergedExtRef.metadata } : {}),
      };
    }

    const result: CreateCommercialDocumentInput = {
      type: (input.type !== undefined
        ? input.type
        : existing.type) as CreateCommercialDocumentInput["type"],
      documentNumber:
        input.documentNumber !== undefined ? input.documentNumber : existing.document_number,
      fiscalYear: input.fiscalYear !== undefined ? input.fiscalYear : existing.fiscal_year,
      partyId: input.partyId !== undefined ? input.partyId : existing.party_id,
      documentDate:
        input.documentDate !== undefined ? input.documentDate : formatDate(existing.document_date),
      dueDate: input.dueDate !== undefined ? input.dueDate : formatDate(existing.due_date),
      currency: input.currency !== undefined ? input.currency : existing.currency,
      netMinor: input.netMinor !== undefined ? input.netMinor : String(existing.net_minor),
      taxMinor: input.taxMinor !== undefined ? input.taxMinor : String(existing.tax_minor),
      grossMinor: input.grossMinor !== undefined ? input.grossMinor : String(existing.gross_minor),
      controlAccountCode:
        input.controlAccountCode !== undefined
          ? input.controlAccountCode
          : existing.control_account_code,
      ...(fundingAccountId
        ? {
            fundingSource: {
              type: "financial_account" as const,
              financialAccountId: fundingAccountId,
            },
          }
        : {}),
      lines: input.lines !== undefined ? input.lines : existingLines,
      ...(seriesVal ? { series: seriesVal } : {}),
      ...(origId ? { originalDocumentId: origId } : {}),
      ...(reasonVal ? { reason: reasonVal } : {}),
      ...(cleanedExtRef ? { externalReference: cleanedExtRef } : {}),
    };

    return result;
  }
  async create(
    context: CommercialDocumentContext,
    input: CreateCommercialDocumentInput,
    idempotencyKey?: string,
  ) {
    if (!context.roles.some((role) => WRITE_ROLES.has(role))) throw new Error("FORBIDDEN");
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    const normalized = this.normalizeRelationships({
      ...input,
      ...(input.type === "purchase_invoice" && !input.funding && !input.fundingSource
        ? { funding: { type: "owner_paid" as const } }
        : {}),
      ...((input.funding?.type === "company_bank" ||
        input.funding?.type === "owner_custody_cash") &&
      input.funding.financialAccountId
        ? {
            fundingSource: {
              type: "financial_account" as const,
              financialAccountId: input.funding.financialAccountId,
            },
          }
        : {}),
    });
    this.validate(normalized);
    await this.store.validateRelationships?.(context.organizationId, normalized);
    return this.envelope(context, await this.store.create(context, normalized, idempotencyKey));
  }
  validatePortableInput(input: CreateCommercialDocumentInput) {
    this.validate(input);
  }
  async reverseReplace(
    context: CommercialDocumentContext,
    id: string,
    expectedVersion: string,
    input: CreateCommercialDocumentInput,
    reason: string,
    idempotencyKey?: string,
  ) {
    if (!context.roles.some((role) => POST_ROLES.has(role))) throw new Error("FORBIDDEN");
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    if (!expectedVersion) throw new Error("VERSION_CONFLICT");
    if (!reason.trim()) throw new Error("VALIDATION_FAILED");
    const normalized = this.normalizeRelationships(input);
    this.validate(normalized);
    await this.store.validateRelationships?.(context.organizationId, normalized);
    return this.envelope(
      context,
      await this.store.reverseReplace(
        context,
        id,
        expectedVersion,
        normalized,
        reason.trim(),
        idempotencyKey,
      ),
    );
  }
  async reclassifyFunding(
    context: CommercialDocumentContext,
    id: string,
    expectedVersion: string,
    input: { targetControlAccountCode: string; reason: string },
    idempotencyKey?: string,
  ) {
    if (!context.roles.some((role) => POST_ROLES.has(role))) throw new Error("FORBIDDEN");
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    if (!expectedVersion || !input.targetControlAccountCode?.trim() || !input.reason?.trim())
      throw new Error("VALIDATION_FAILED");
    return this.envelope(
      context,
      await this.store.reclassifyFunding(
        context,
        id,
        expectedVersion,
        input.targetControlAccountCode.trim(),
        input.reason.trim(),
        idempotencyKey,
      ),
    );
  }
  async commitRelationshipBackfill(
    context: CommercialDocumentContext,
    id: string,
    expectedVersion: string,
    replacement: CreateCommercialDocumentInput,
    reason: string,
    planHash: string,
    idempotencyKey?: string,
  ) {
    const normalized = this.normalizeRelationships(replacement);
    const expectedPlanHash = createHash("sha256")
      .update(
        JSON.stringify({ id, expectedVersion, replacement: normalized, reason: reason.trim() }),
      )
      .digest("hex");
    if (expectedPlanHash !== planHash) throw new Error("RELATIONSHIP_BACKFILL_PLAN_MISMATCH");
    const existing = await this.store.get(context.organizationId, id);
    if (!existing) throw new Error("RESOURCE_NOT_FOUND");
    if (["partially_paid", "paid"].includes(existing.state)) {
      const projectIds = new Set(
        normalized.lines.flatMap((line) =>
          line.allocations
            .map((allocation) => allocation.dimensions.projectId ?? line.dimensions?.projectId)
            .filter((projectId): projectId is string => Boolean(projectId)),
        ),
      );
      if (projectIds.size !== 1) throw new Error("VALIDATION_FAILED");
      const projectId = projectIds.values().next().value;
      if (!projectId) throw new Error("VALIDATION_FAILED");
      return this.updateMetadata(
        context,
        id,
        expectedVersion,
        { projectId, reason: reason.trim() },
        idempotencyKey,
      );
    }
    return this.reverseReplace(context, id, expectedVersion, normalized, reason, idempotencyKey);
  }
  private normalizeRelationships(
    input: CreateCommercialDocumentInput,
  ): CreateCommercialDocumentInput {
    return {
      ...input,
      lines: (Array.isArray(input?.lines) ? input.lines : []).map(
        (line: CommercialDocumentLineInput) => {
          const lineCategory = line.categoryCode?.trim() || line.dimensions?.category?.trim();
          const allocationCategories = line.allocations
            .map((allocation) => allocation.dimensions.category?.trim())
            .filter((category): category is string => Boolean(category));
          const categories = [lineCategory, ...allocationCategories].filter(
            (category): category is string => Boolean(category),
          );
          if (new Set(categories).size > 1) throw new Error("CATEGORY_AMBIGUOUS");
          const dimensions = Object.fromEntries(
            Object.entries(line.dimensions ?? {}).filter(([key]) => key !== "category"),
          );
          const categoryCode = categories[0];
          return {
            ...line,
            ...(categoryCode ? { categoryCode } : {}),
            ...(Object.keys(dimensions).length ? { dimensions } : {}),
            allocations: (Array.isArray(line.allocations) ? line.allocations : []).map(
              (allocation: DocumentAllocationInput) => {
                const allocationDimensions = Object.fromEntries(
                  Object.entries(allocation.dimensions ?? {}).filter(([key]) => key !== "category"),
                );
                return {
                  ...allocation,
                  dimensions: {
                    ...allocationDimensions,
                    ...(dimensions.projectId && !allocationDimensions.projectId
                      ? { projectId: dimensions.projectId }
                      : {}),
                    ...(dimensions.contractId && !allocationDimensions.contractId
                      ? { contractId: dimensions.contractId }
                      : {}),
                  },
                };
              },
            ),
          };
        },
      ),
    };
  }
  async transition(
    context: CommercialDocumentContext,
    id: string,
    action: CommercialDocumentAction,
    input: { reason?: string },
    idempotencyKey?: string,
  ) {
    const roles =
      action === "approve"
        ? APPROVE_ROLES
        : ["issue", "post", "cancel"].includes(action)
          ? POST_ROLES
          : WRITE_ROLES;
    if (!context.roles.some((role) => roles.has(role))) throw new Error("FORBIDDEN");
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    if (!input.reason?.trim()) throw new Error("VALIDATION_FAILED");
    return this.envelope(
      context,
      await this.store.transition(context, id, action, input.reason.trim(), idempotencyKey),
    );
  }
  private validate(input: CreateCommercialDocumentInput) {
    this.validateFunding(input);
    if (
      input.fundingSource &&
      (input.type !== "purchase_invoice" ||
        input.fundingSource.type !== "financial_account" ||
        !input.fundingSource.financialAccountId?.trim())
    )
      throw new Error("PURCHASE_FUNDING_SOURCE_INVALID");
    if (
      (input.migrationSourceExpenseId || input.migrationSourceExpenseDate) &&
      (input.type !== "purchase_invoice" ||
        !input.migrationSourceExpenseId ||
        !input.migrationSourceExpenseDate ||
        !/^\d{4}-\d{2}-\d{2}$/.test(input.migrationSourceExpenseDate))
    )
      throw new Error("MIGRATION_SOURCE_EXPENSE_INVALID");
    if (
      !input.documentNumber?.trim() ||
      !input.partyId?.trim() ||
      !input.controlAccountCode?.trim() ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.documentDate) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate) ||
      input.dueDate < input.documentDate ||
      !/^[A-Z]{3}$/.test(input.currency) ||
      !Array.isArray(input.lines) ||
      input.lines.length === 0 ||
      !Number.isInteger(input.fiscalYear) ||
      input.fiscalYear < 1900 ||
      input.fiscalYear > 9999
    )
      throw new Error("VALIDATION_FAILED");
    if (
      (input.type === "credit_note") !== Boolean(input.originalDocumentId) ||
      (input.type === "credit_note" && !input.reason?.trim())
    )
      throw new Error("VALIDATION_FAILED");
    let net = 0n;
    let tax = 0n;
    let gross = 0n;
    for (const line of input.lines) {
      let lineNet: bigint;
      let lineTax: bigint;
      let lineGross: bigint;
      let quantity: number;
      try {
        lineNet = BigInt(line.netMinor);
        lineTax = BigInt(line.taxMinor);
        lineGross = BigInt(line.grossMinor);
        quantity = Number(line.quantity);
      } catch {
        throw new Error("VALIDATION_FAILED");
      }
      if (
        !line.description?.trim() ||
        !line.primaryAccountCode?.trim() ||
        quantity <= 0 ||
        !Number.isFinite(quantity) ||
        lineNet <= 0n ||
        lineTax < 0n ||
        lineGross !== lineNet + lineTax ||
        (lineTax > 0n && !line.taxAccountCode?.trim()) ||
        (lineTax === 0n && line.taxAccountCode)
      )
        throw new Error("VALIDATION_FAILED");
      if (
        input.type === "purchase_invoice" &&
        lineTax > 0n &&
        line.allocations.some(
          (allocation: DocumentAllocationInput) =>
            allocation.dimensions.taxState !== undefined &&
            ![
              "unreviewed",
              "eligible",
              "partially_eligible",
              "ineligible",
              "accountant_override",
            ].includes(allocation.dimensions.taxState),
        )
      )
        throw new Error("PURCHASE_TAX_REVIEW_REQUIRED");
      const ids = new Set<string>();
      let allocated = 0n;
      for (const allocation of line.allocations) {
        if (
          !allocation.id?.trim() ||
          ids.has(allocation.id) ||
          Object.keys(allocation.dimensions).length === 0
        )
          throw new Error("DOCUMENT_ALLOCATION_INVALID");
        ids.add(allocation.id);
        const amount = BigInt(allocation.amountMinor);
        if (amount <= 0n) throw new Error("DOCUMENT_ALLOCATION_INVALID");
        allocated += amount;
      }
      if (allocated !== lineNet) throw new Error("DOCUMENT_ALLOCATION_MISMATCH");
      net += lineNet;
      tax += lineTax;
      gross += lineGross;
    }
    if (
      net !== BigInt(input.netMinor) ||
      tax !== BigInt(input.taxMinor) ||
      gross !== BigInt(input.grossMinor) ||
      gross !== net + tax
    )
      throw new Error("DOCUMENT_CONTROL_TOTAL_MISMATCH");

    if (input.externalReference) {
      if (!input.externalReference.system?.trim() || !input.externalReference.externalId?.trim()) {
        throw new Error("VALIDATION_FAILED");
      }
    }
  }
  private validateFunding(input: CreateCommercialDocumentInput) {
    if (!input.funding) return;
    const allowed = ["company_bank", "owner_paid", "owner_custody_cash"] as const;
    const type = input.funding.type;
    const fieldErrors: Array<{ field: string; message: string; expected?: readonly string[] }> = [];
    if (!allowed.includes(type))
      fieldErrors.push({
        field: "funding.type",
        message: "Nguồn tiền không được hỗ trợ",
        expected: allowed,
      });
    if (
      (type === "company_bank" || type === "owner_custody_cash") &&
      !input.funding.financialAccountId?.trim()
    )
      fieldErrors.push({
        field: "funding.financialAccountId",
        message: "Bắt buộc khi chi từ ngân hàng công ty hoặc tiền mặt công ty do chủ giữ",
      });
    if (type === "owner_paid" && input.funding.financialAccountId)
      fieldErrors.push({
        field: "funding.financialAccountId",
        message: "Không truyền tài khoản công ty khi chủ chi hộ",
      });
    if (fieldErrors.length) {
      const error = new Error("FUNDING_SOURCE_INVALID") as Error & { details: unknown };
      error.details = { fieldErrors, allowedTypes: allowed };
      throw error;
    }
    if (input.type !== "purchase_invoice") {
      const error = new Error("FUNDING_SOURCE_INVALID") as Error & { details: unknown };
      error.details = {
        fieldErrors: [
          { field: "funding.type", message: "Nguồn tiền chỉ áp dụng cho hóa đơn đầu vào" },
        ],
      };
      throw error;
    }
  }
}
