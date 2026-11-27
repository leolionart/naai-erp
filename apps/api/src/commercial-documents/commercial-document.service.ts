import { listCommercialDocumentPage } from "./commercial-document-list.page.js";
import { Inject, Injectable, Optional } from "@nestjs/common";
import { createHash } from "node:crypto";
import { API_VERSION, type RawListQuery } from "@naai-erp/contracts";
import { assertMasterBaseCurrency } from "../common/base-currency-guard.js";
import {
  ROUTINE_DOCUMENT_ACTIONS,
  resolveRoutineActionReason,
} from "../draft-recording/draft-recording.types.js";
import { FundingRulesService } from "../funding-rules/funding-rules.service.js";
import { MasterDataService } from "../master-data/master-data.service.js";
import { validateCommercialDocumentFunding } from "./commercial-document-funding.validator.js";
import {
  mergeCommercialDocumentInput,
  normalizeDocumentRelationships,
} from "./document-merge.helper.js";
import { PgCommercialDocumentStore } from "./pg-commercial-document.store.js";
import type {
  CommercialDocumentAction,
  CommercialDocumentCategoryInput,
  CommercialDocumentMetadataInput,
  CommercialDocumentContext,
  CommercialDocumentTaxReviewInput,
  CommercialDocumentTaxCodeCorrectionInput,
  CreateCommercialDocumentInput,
  DocumentAllocationInput,
  UpdateCommercialDocumentInput,
} from "./commercial-document.types.js";

const WRITE_ROLES = new Set(["owner", "finance_admin", "accountant", "integration"]);
const APPROVE_ROLES = new Set(["owner", "finance_admin", "accountant", "approver"]);
const POST_ROLES = new Set(["owner", "finance_admin", "accountant"]);

@Injectable()
export class CommercialDocumentService {
  constructor(
    @Inject(PgCommercialDocumentStore) private readonly store: PgCommercialDocumentStore,
    @Inject(MasterDataService) private readonly masterData: MasterDataService,
    @Optional() @Inject(FundingRulesService) private readonly fundingRules?: FundingRulesService,
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
    paging: RawListQuery = {},
  ) {
    const filters = { type, state, partyId, projectId, startsOn, endsOn };
    const page = await listCommercialDocumentPage(
      this.store,
      context.organizationId,
      filters,
      paging,
    );
    return { ...this.envelope(context, page.data), meta: page.meta };
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
    await assertMasterBaseCurrency(this.masterData, context.organizationId, normalized.currency);
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
    await assertMasterBaseCurrency(this.masterData, context.organizationId, merged.currency);
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
    existing: Parameters<typeof mergeCommercialDocumentInput>[0],
    input: UpdateCommercialDocumentInput,
  ): CreateCommercialDocumentInput {
    return mergeCommercialDocumentInput(existing, input);
  }
  async create(
    context: CommercialDocumentContext,
    input: CreateCommercialDocumentInput,
    idempotencyKey?: string,
  ) {
    if (!context.roles.some((role) => WRITE_ROLES.has(role))) throw new Error("FORBIDDEN");
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    let resolvedFunding = input.funding;
    if (input.type === "purchase_invoice" && !resolvedFunding && !input.fundingSource) {
      if (this.fundingRules) {
        const line = input.lines?.[0];
        const resolution = await this.fundingRules.resolveForIngestion(context.organizationId, {
          externalSystem: input.externalReference?.system,
          partyId: input.partyId,
          categoryCode:
            line?.categoryCode ??
            (typeof line?.dimensions?.category === "string" ? line.dimensions.category : undefined),
          description: line?.description,
          grossMinor: input.grossMinor,
        });
        resolvedFunding = resolution.resolvedFunding;
      } else {
        resolvedFunding = { type: "owner_paid" as const };
      }
    }
    const normalized = this.normalizeRelationships({
      ...input,
      ...(resolvedFunding ? { funding: resolvedFunding } : {}),
      ...((resolvedFunding?.type === "company_bank" ||
        resolvedFunding?.type === "company_cash" ||
        resolvedFunding?.type === "owner_custody_cash") &&
      resolvedFunding.financialAccountId
        ? {
            fundingSource: {
              type: "financial_account" as const,
              financialAccountId: resolvedFunding.financialAccountId,
            },
          }
        : {}),
    });
    this.validate(normalized);
    await assertMasterBaseCurrency(this.masterData, context.organizationId, normalized.currency);
    await this.store.validateRelationships?.(context.organizationId, normalized);
    return this.envelope(context, await this.store.create(context, normalized, idempotencyKey));
  }
  validatePortableInput(input: CreateCommercialDocumentInput) {
    this.validate(input);
  }
  /** Void a posted/issued document without a replacement (journal reversal, state cancelled). */
  async reverse(
    context: CommercialDocumentContext,
    id: string,
    expectedVersion: string,
    reason: string,
    idempotencyKey?: string,
  ) {
    if (!context.roles.some((role) => POST_ROLES.has(role))) throw new Error("FORBIDDEN");
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    if (!expectedVersion) throw new Error("VERSION_CONFLICT");
    if (!reason.trim()) throw new Error("VALIDATION_FAILED");
    return this.envelope(
      context,
      await this.store.reverse(context, id, expectedVersion, reason.trim(), idempotencyKey),
    );
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
    await assertMasterBaseCurrency(this.masterData, context.organizationId, normalized.currency);
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
    input: {
      targetControlAccountCode?: string;
      financialAccountId?: string;
      postReplacement?: boolean;
      reason: string;
    },
    idempotencyKey?: string,
  ) {
    if (!context.roles.some((role) => POST_ROLES.has(role))) throw new Error("FORBIDDEN");
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    const targetControl = input.targetControlAccountCode?.trim() ?? "";
    const financialAccountId = input.financialAccountId?.trim();
    const reason = input.reason?.trim() ?? "";
    if (!expectedVersion || (!targetControl && !financialAccountId) || !reason)
      throw new Error("VALIDATION_FAILED");
    const result = financialAccountId
      ? await this.store.reclassifyFunding(
          context,
          id,
          expectedVersion,
          targetControl,
          reason,
          idempotencyKey,
          { financialAccountId },
        )
      : await this.store.reclassifyFunding(
          context,
          id,
          expectedVersion,
          targetControl,
          reason,
          idempotencyKey,
        );
    const shouldAutoPost =
      input.postReplacement ??
      (context.roles.includes("owner") &&
        Boolean(await this.store.isSolopreneur?.(context.organizationId)));
    const replacementId = (result as { replacementDocumentId?: string }).replacementDocumentId;
    if (
      shouldAutoPost &&
      replacementId &&
      !(result as { idempotencyReplayed?: boolean }).idempotencyReplayed
    ) {
      await this.transition(
        context,
        replacementId,
        "capture",
        { reason },
        `${idempotencyKey}:capture`,
      );
      await this.transition(
        context,
        replacementId,
        "verify",
        { reason },
        `${idempotencyKey}:verify`,
      );
      await this.transition(
        context,
        replacementId,
        "approve",
        { reason },
        `${idempotencyKey}:approve`,
      );
      await this.transition(context, replacementId, "post", { reason }, `${idempotencyKey}:post`);
      return this.envelope(context, { ...result, replacementState: "posted" });
    }
    return this.envelope(context, {
      ...result,
      ...(shouldAutoPost ? { replacementState: "posted" } : {}),
    });
  }
  async reclassifyAccounts(
    context: CommercialDocumentContext,
    id: string,
    expectedVersion: string,
    input: {
      lines: ReadonlyArray<{
        lineNumber: number;
        primaryAccountCode?: string;
        categoryCode?: string;
      }>;
      postReplacement?: boolean;
      reason: string;
    },
    idempotencyKey?: string,
  ) {
    if (!context.roles.some((role) => POST_ROLES.has(role))) throw new Error("FORBIDDEN");
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    const reason = input.reason?.trim() ?? "";
    if (!expectedVersion || !Array.isArray(input.lines) || input.lines.length === 0 || !reason)
      throw new Error("VALIDATION_FAILED");
    const result = await this.store.reclassifyAccounts(
      context,
      id,
      expectedVersion,
      input.lines,
      reason,
      idempotencyKey,
    );
    const shouldAutoPost =
      input.postReplacement ??
      (context.roles.includes("owner") &&
        Boolean(await this.store.isSolopreneur?.(context.organizationId)));
    const replacementId = (result as { replacementDocumentId?: string }).replacementDocumentId;
    if (
      shouldAutoPost &&
      replacementId &&
      !(result as { idempotencyReplayed?: boolean }).idempotencyReplayed
    ) {
      const rep = await this.store.get(context.organizationId, replacementId);
      if (rep?.type === "sales_invoice") {
        await this.transition(
          context,
          replacementId,
          "validate",
          { reason },
          `${idempotencyKey}:validate`,
        );
        await this.transition(
          context,
          replacementId,
          "issue",
          { reason },
          `${idempotencyKey}:issue`,
        );
        return this.envelope(context, { ...result, replacementState: "issued" });
      }
      await this.transition(
        context,
        replacementId,
        "capture",
        { reason },
        `${idempotencyKey}:capture`,
      );
      await this.transition(
        context,
        replacementId,
        "verify",
        { reason },
        `${idempotencyKey}:verify`,
      );
      await this.transition(
        context,
        replacementId,
        "approve",
        { reason },
        `${idempotencyKey}:approve`,
      );
      await this.transition(context, replacementId, "post", { reason }, `${idempotencyKey}:post`);
      return this.envelope(context, { ...result, replacementState: "posted" });
    }
    return this.envelope(context, {
      ...result,
      ...(shouldAutoPost ? { replacementState: "posted" } : {}),
    });
  }
  async reclassifyFundingByExternal(
    context: CommercialDocumentContext,
    system: string,
    externalId: string,
    expectedVersion: string,
    input: {
      targetControlAccountCode?: string;
      financialAccountId?: string;
      postReplacement?: boolean;
      reason: string;
    },
    idempotencyKey?: string,
  ) {
    if (!context.roles.some((role) => POST_ROLES.has(role))) throw new Error("FORBIDDEN");
    const id = await this.store.findIdByExternalReference?.(
      context.organizationId,
      system,
      externalId,
    );
    if (!id) throw new Error("RESOURCE_NOT_FOUND");
    return this.reclassifyFunding(context, id, expectedVersion, input, idempotencyKey);
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
    return normalizeDocumentRelationships(input);
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
    const allowDefault =
      ROUTINE_DOCUMENT_ACTIONS.has(action) &&
      context.roles.includes("owner") &&
      Boolean(await this.store.isSolopreneur?.(context.organizationId));
    const effectiveReason = resolveRoutineActionReason(input?.reason, allowDefault);
    if (!effectiveReason) throw new Error("VALIDATION_FAILED");
    if (action === "issue" || action === "post") {
      const existing = await this.store.get?.(context.organizationId, id);
      if (existing?.currency)
        await assertMasterBaseCurrency(this.masterData, context.organizationId, existing.currency);
    }
    return this.envelope(
      context,
      await this.store.transition(context, id, action, effectiveReason, idempotencyKey),
    );
  }
  private validate(input: CreateCommercialDocumentInput) {
    validateCommercialDocumentFunding(input);
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
}
