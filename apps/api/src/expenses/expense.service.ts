import type { RawListQuery } from "@naai-erp/contracts";
import { countExpenseRows, listExpensePage, summarizeExpenseRows } from "./expense-list.handler.js";
import type { ExpenseListFilters } from "./expense-list.queries.js";
import { Inject, Injectable, Optional } from "@nestjs/common";
import { createHash } from "node:crypto";
import { API_VERSION } from "@naai-erp/contracts";
import { assertMasterBaseCurrency } from "../common/base-currency-guard.js";
import {
  ROUTINE_EXPENSE_ACTIONS,
  resolveRoutineActionReason,
} from "../draft-recording/draft-recording.types.js";
import { FundingRulesService } from "../funding-rules/funding-rules.service.js";
import { MasterDataService } from "../master-data/master-data.service.js";
import { normalizeExpenseRelationships } from "./expense-relationships.js";
import { validateExpensePayload } from "./expense-validation.js";
import { applyExpenseFundingAndOwnerPersonalPolicy } from "./expense-funding.js";
import { mergeExpenseInput } from "./expense-merge.helper.js";
import { PgExpenseStore } from "./pg-expense.store.js";
import type {
  CreateExpenseInput,
  ExpenseCategoryInput,
  ExpenseContext,
  ExpenseMetadataInput,
  ExpenseReviewInput,
} from "./expense.types.js";

const WRITE = new Set(["owner", "finance_admin", "accountant", "integration"]);
const REVIEW = new Set(["owner", "finance_admin", "accountant", "approver"]);
const TAX_REVIEW = new Set(["owner", "finance_admin", "accountant"]);
const POST = new Set(["owner", "finance_admin", "accountant"]);

@Injectable()
export class ExpenseService {
  constructor(
    @Inject(PgExpenseStore) private readonly store: PgExpenseStore,
    @Inject(MasterDataService) private readonly master: MasterDataService,
    @Optional() @Inject(FundingRulesService) private readonly fundingRules?: FundingRulesService,
  ) {}
  authenticate(authorization: string | undefined, organizationId: string, correlationId: string) {
    return this.master.authenticate(authorization, organizationId, correlationId);
  }
  private envelope(context: ExpenseContext, data: unknown) {
    return {
      apiVersion: API_VERSION,
      requestId: context.correlationId,
      organizationId: context.organizationId,
      data,
    };
  }
  async list(context: ExpenseContext, filters: ExpenseListFilters, paging: RawListQuery = {}) {
    const page = await listExpensePage(this.store, context.organizationId, filters, paging);
    return { ...this.envelope(context, page.data), meta: page.meta };
  }
  async count(context: ExpenseContext, filters: ExpenseListFilters) {
    return this.envelope(
      context,
      await countExpenseRows(this.store, context.organizationId, filters),
    );
  }
  async summary(context: ExpenseContext, filters: ExpenseListFilters, groupBy?: string) {
    return this.envelope(
      context,
      await summarizeExpenseRows(this.store, context.organizationId, filters, groupBy),
    );
  }
  async get(context: ExpenseContext, id: string) {
    const item = await this.store.get(context.organizationId, id);
    if (!item) throw new Error("RESOURCE_NOT_FOUND");
    return this.envelope(context, item);
  }
  async relationshipBackfillInventory(context: ExpenseContext) {
    return this.envelope(context, {
      items: await this.store.relationshipBackfillInventory(context.organizationId),
    });
  }
  async dryRunTaxFinalization(context: ExpenseContext, reason: string) {
    if (!context.roles.some((role) => TAX_REVIEW.has(role))) throw new Error("FORBIDDEN");
    if (!reason.trim()) throw new Error("VALIDATION_FAILED");
    return this.envelope(context, await this.store.dryRunTaxFinalization(context, reason.trim()));
  }
  async commitTaxFinalization(
    context: ExpenseContext,
    reason: string,
    planHash: string,
    key?: string,
  ) {
    if (!context.roles.some((role) => TAX_REVIEW.has(role))) throw new Error("FORBIDDEN");
    if (!reason.trim() || !planHash) throw new Error("VALIDATION_FAILED");
    if (!key) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    return this.envelope(
      context,
      await this.store.commitTaxFinalization(context, reason.trim(), planHash, key),
    );
  }
  async dryRunFundingInference(context: ExpenseContext, reason: string) {
    if (!context.roles.some((role) => WRITE.has(role))) throw new Error("FORBIDDEN");
    if (!reason.trim()) throw new Error("VALIDATION_FAILED");
    return this.envelope(
      context,
      await this.store.dryRunFundingInference(context.organizationId, reason.trim()),
    );
  }
  async commitFundingInference(
    context: ExpenseContext,
    reason: string,
    planHash: string,
    key?: string,
  ) {
    if (!context.roles.some((role) => WRITE.has(role))) throw new Error("FORBIDDEN");
    if (!reason.trim() || !planHash) throw new Error("VALIDATION_FAILED");
    if (!key) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    return this.envelope(
      context,
      await this.store.commitFundingInference(context, reason.trim(), planHash, key),
    );
  }
  async dryRunRelationshipBackfill(
    context: ExpenseContext,
    id: string,
    expectedVersion: string,
    replacement: CreateExpenseInput,
    reason: string,
  ) {
    if (!context.roles.some((role) => POST.has(role))) throw new Error("FORBIDDEN");
    if (!expectedVersion) throw new Error("VERSION_CONFLICT");
    if (!reason.trim()) throw new Error("VALIDATION_FAILED");
    const existing = await this.store.get(context.organizationId, id);
    if (!existing) throw new Error("RESOURCE_NOT_FOUND");
    if (String(existing.version) !== expectedVersion) throw new Error("VERSION_CONFLICT");
    if (existing.state !== "posted") throw new Error("INVALID_EXPENSE_TRANSITION");
    const normalized = normalizeExpenseRelationships(replacement);
    this.validate(normalized);
    await assertMasterBaseCurrency(this.master, context.organizationId, normalized.currency);
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
      effects: ["reverse_original_journal", "reverse_original", "create_replacement_draft"],
    });
  }
  async updateCategory(
    context: ExpenseContext,
    id: string,
    input: ExpenseCategoryInput,
    key?: string,
  ) {
    if (!context.roles.some((role) => WRITE.has(role))) throw new Error("FORBIDDEN");
    if (!key) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    const category = input.category?.trim();
    if (!category) throw new Error("VALIDATION_FAILED");
    return this.envelope(context, await this.store.updateCategory(context, id, category, key));
  }
  async updateMetadata(
    context: ExpenseContext,
    id: string,
    expectedVersion: string,
    input: ExpenseMetadataInput,
    key?: string,
  ) {
    if (!context.roles.some((role) => WRITE.has(role))) throw new Error("FORBIDDEN");
    if (!key) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    if (!expectedVersion) throw new Error("VERSION_CONFLICT");
    const hasPayee = Object.prototype.hasOwnProperty.call(input, "payeePartyId");
    const hasCustomer = Object.prototype.hasOwnProperty.call(input, "customerPartyId");
    const hasProject = Object.prototype.hasOwnProperty.call(input, "projectId");
    const hasPurpose = Object.prototype.hasOwnProperty.call(input, "businessPurpose");
    const hasCategory = Object.prototype.hasOwnProperty.call(input, "category");
    const hasDescriptions = Object.prototype.hasOwnProperty.call(input, "lineDescriptions");
    if (!hasPayee && !hasCustomer && !hasProject && !hasPurpose && !hasCategory && !hasDescriptions)
      throw new Error("VALIDATION_FAILED");

    const payeePartyId =
      input.payeePartyId === null
        ? null
        : input.payeePartyId === undefined
          ? undefined
          : input.payeePartyId.trim();
    const customerPartyId = input.customerPartyId === null ? null : input.customerPartyId?.trim();
    const projectId = input.projectId === null ? null : input.projectId?.trim();
    const businessPurpose = input.businessPurpose?.trim();
    const category =
      input.category === null
        ? null
        : input.category === undefined
          ? undefined
          : input.category.trim();
    const lineDescriptions = input.lineDescriptions?.map((line) => ({
      lineNumber: line.lineNumber,
      description: line.description?.trim(),
    }));
    if (
      (hasPayee && payeePartyId !== null && !payeePartyId) ||
      (hasCustomer && customerPartyId !== null && !customerPartyId) ||
      (hasProject && projectId !== null && !projectId) ||
      (hasPurpose && !businessPurpose) ||
      (hasCategory && category !== null && !category) ||
      (hasDescriptions && (!lineDescriptions || lineDescriptions.length === 0))
    )
      throw new Error("VALIDATION_FAILED");
    const lineNumbers = new Set<number>();
    for (const line of lineDescriptions ?? []) {
      if (
        !Number.isInteger(line.lineNumber) ||
        line.lineNumber < 1 ||
        !line.description ||
        lineNumbers.has(line.lineNumber)
      )
        throw new Error("VALIDATION_FAILED");
      lineNumbers.add(line.lineNumber);
    }
    const normalized: ExpenseMetadataInput = {
      ...(hasPayee ? { payeePartyId: payeePartyId as string | null } : {}),
      ...(hasCustomer ? { customerPartyId: customerPartyId as string | null } : {}),
      ...(hasProject ? { projectId: projectId as string | null } : {}),
      ...(hasPurpose ? { businessPurpose: businessPurpose as string } : {}),
      ...(hasCategory ? { category: category as string | null } : {}),
      ...(hasDescriptions
        ? {
            lineDescriptions: lineDescriptions as readonly {
              lineNumber: number;
              description: string;
            }[],
          }
        : {}),
    };
    return this.envelope(
      context,
      await this.store.updateMetadata(context, id, expectedVersion, normalized, key),
    );
  }
  async correct(
    context: ExpenseContext,
    id: string,
    expectedVersion: string,
    input: { category?: string; funding?: unknown; reason: string },
    key?: string,
  ) {
    if (!input.reason?.trim()) throw new Error("VALIDATION_FAILED");
    if (input.funding) throw new Error("FUNDING_CORRECTION_REQUIRES_REPLACEMENT");
    return this.updateMetadata(
      context,
      id,
      expectedVersion,
      { ...(input.category !== undefined ? { category: input.category } : {}) },
      key,
    );
  }
  async update(
    context: ExpenseContext,
    id: string,
    expectedVersion: string,
    input: Partial<CreateExpenseInput>,
    key?: string,
  ) {
    if (!context.roles.some((r) => WRITE.has(r))) throw new Error("FORBIDDEN");
    if (!key) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    if (!expectedVersion) throw new Error("VERSION_CONFLICT");

    const existing = await this.store.get(context.organizationId, id);
    if (!existing) throw new Error("RESOURCE_NOT_FOUND");
    if (existing.state !== "draft") throw new Error("INVALID_STATE_TRANSITION");
    if (existing.version.toString() !== expectedVersion) throw new Error("VERSION_CONFLICT");

    const mergedInput = this.mergeExpense(existing, input);
    const merged = normalizeExpenseRelationships({
      ...mergedInput,
      ...(mergedInput.funding?.financialAccountId && !mergedInput.fundingFinancialAccountId
        ? { fundingFinancialAccountId: mergedInput.funding.financialAccountId }
        : {}),
    });
    this.validate(merged);
    await assertMasterBaseCurrency(this.master, context.organizationId, merged.currency);
    await this.store.validateRelationships?.(context.organizationId, merged);

    return this.envelope(
      context,
      await this.store.update(context, id, expectedVersion, merged, key),
    );
  }
  async discard(
    context: ExpenseContext,
    id: string,
    expectedVersion: string,
    reason: string,
    key?: string,
  ) {
    if (!context.roles.some((role) => WRITE.has(role))) throw new Error("FORBIDDEN");
    if (!key) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    if (!expectedVersion) throw new Error("VERSION_CONFLICT");
    if (!reason.trim()) throw new Error("VALIDATION_FAILED");
    return this.envelope(
      context,
      await this.store.discard(context, id, expectedVersion, reason.trim(), key),
    );
  }

  private mergeExpense(
    existing: Parameters<typeof mergeExpenseInput>[0],
    input: Partial<CreateExpenseInput>,
  ): CreateExpenseInput {
    return mergeExpenseInput(existing, input);
  }
  async create(context: ExpenseContext, input: CreateExpenseInput, key?: string) {
    if (!context.roles.some((r) => WRITE.has(r))) throw new Error("FORBIDDEN");
    if (!key) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    let resolvedFunding = input.funding;
    if (
      !resolvedFunding &&
      !input.fundingFinancialAccountId &&
      !input.counterAccountCode?.trim() &&
      this.fundingRules
    ) {
      const line = input.lines?.[0];
      const resolution = await this.fundingRules.resolveForIngestion(context.organizationId, {
        externalSystem: input.externalReference?.system,
        partyId: input.payeePartyId,
        categoryCode:
          line?.expenseCategoryCode ??
          (typeof line?.dimensions?.category === "string" ? line.dimensions.category : undefined),
        description: input.businessPurpose || line?.description,
        grossMinor: input.grossMinor,
      });
      resolvedFunding = resolution.resolvedFunding;
    }
    const prepared = await applyExpenseFundingAndOwnerPersonalPolicy(
      context.organizationId,
      input,
      resolvedFunding,
      this.store,
    );
    const normalized = normalizeExpenseRelationships(prepared);
    this.validate(normalized);
    await assertMasterBaseCurrency(this.master, context.organizationId, normalized.currency);
    await this.store.validateRelationships?.(context.organizationId, normalized);
    return this.envelope(context, await this.store.create(context, normalized, key));
  }
  validatePortableInput(input: CreateExpenseInput) {
    this.validate(input);
  }
  async reverseReplace(
    context: ExpenseContext,
    id: string,
    expectedVersion: string,
    input: CreateExpenseInput,
    reason: string,
    key?: string,
  ) {
    if (!context.roles.some((role) => POST.has(role))) throw new Error("FORBIDDEN");
    if (!key) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    if (!expectedVersion) throw new Error("VERSION_CONFLICT");
    if (!reason.trim()) throw new Error("VALIDATION_FAILED");
    const normalized = normalizeExpenseRelationships(input);
    this.validate(normalized);
    await assertMasterBaseCurrency(this.master, context.organizationId, normalized.currency);
    await this.store.validateRelationships?.(context.organizationId, normalized);
    return this.envelope(
      context,
      await this.store.reverseReplace(context, id, expectedVersion, normalized, reason.trim(), key),
    );
  }

  /** Reverse a posted expense without creating a replacement record. */
  async reverse(
    context: ExpenseContext,
    id: string,
    expectedVersion: string,
    reason: string,
    key?: string,
  ) {
    if (!context.roles.some((role) => POST.has(role))) throw new Error("FORBIDDEN");
    if (!key) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    if (!expectedVersion) throw new Error("VERSION_CONFLICT");
    if (!reason.trim()) throw new Error("VALIDATION_FAILED");
    return this.envelope(
      context,
      await this.store.reverse(context, id, expectedVersion, reason.trim(), key),
    );
  }
  /**
   * Moves a posted expense to another payment source (company cash/bank, owner-held custody cash or
   * owner-paid). The replacement is rebuilt from the stored record, so callers send only the target:
   * `financialAccountId` for a financial account (needed to tell the owner-held custody cash apart
   * from company cash, which share one ledger account) or `counterAccountCode` for a ledger source
   * such as the owner-current account. The old journal is reversed and a draft replacement created.
   */
  async reclassifyFunding(
    context: ExpenseContext,
    id: string,
    expectedVersion: string,
    input: {
      financialAccountId?: string;
      counterAccountCode?: string;
      postReplacement?: boolean;
      reason?: string;
    },
    key?: string,
  ) {
    if (!context.roles.some((role) => POST.has(role))) throw new Error("FORBIDDEN");
    if (!key) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    if (!expectedVersion) throw new Error("VERSION_CONFLICT");
    const reason = input.reason?.trim() ?? "";
    const financialAccountId = input.financialAccountId?.trim();
    const counterAccountCode = input.counterAccountCode?.trim();
    if (!reason || (!financialAccountId && !counterAccountCode))
      throw new Error("VALIDATION_FAILED");
    const existing = await this.store.get(context.organizationId, id);
    if (!existing) throw new Error("RESOURCE_NOT_FOUND");
    // State and version are enforced (after idempotent replay) by the store's reverseReplace.
    let targetCounter = counterAccountCode as string;
    if (financialAccountId) {
      const account = await this.store.fundingAccount(context.organizationId, financialAccountId);
      if (!account || account.currency !== existing.currency)
        throw new Error("EXPENSE_FUNDING_ACCOUNT_NOT_AVAILABLE");
      targetCounter = account.ledger_account_code;
    }
    const merged = this.mergeExpense(existing, { counterAccountCode: targetCounter });
    // mergeExpense keeps the old funding link; a ledger-only target must drop it.
    const withoutLink = Object.fromEntries(
      Object.entries(merged).filter(([name]) => name !== "fundingFinancialAccountId"),
    ) as CreateExpenseInput;
    const replacement: CreateExpenseInput = {
      ...withoutLink,
      // Derived from the idempotency key so a retried request rebuilds the identical replacement.
      id: this.replacementId(context.organizationId, id, key),
      ...(financialAccountId ? { fundingFinancialAccountId: financialAccountId } : {}),
    };
    const replaced = await this.reverseReplace(
      context,
      id,
      expectedVersion,
      replacement,
      reason,
      key,
    );
    const shouldAutoPost =
      input.postReplacement ??
      (context.roles.includes("owner") &&
        (await this.store.isSolopreneur?.(context.organizationId)));
    const replacementId = (replaced.data as { replacementExpenseId?: string }).replacementExpenseId;
    if (
      shouldAutoPost &&
      replacementId &&
      !(replaced.data as { idempotencyReplayed?: boolean }).idempotencyReplayed
    ) {
      await this.transition(context, replacementId, "submit", { reason }, `${key}:submit`);
      await this.transition(context, replacementId, "approve", { reason }, `${key}:approve`);
      await this.transition(context, replacementId, "post", { reason }, `${key}:post`);
      return {
        ...replaced,
        data: { ...(replaced.data as Record<string, unknown>), replacementState: "posted" },
      };
    }
    return {
      ...replaced,
      data: {
        ...(replaced.data as Record<string, unknown>),
        replacementState: shouldAutoPost ? "posted" : "draft",
      },
    };
  }
  async reclassifyFundingByExternal(
    context: ExpenseContext,
    system: string,
    externalId: string,
    expectedVersion: string,
    input: {
      financialAccountId?: string;
      counterAccountCode?: string;
      postReplacement?: boolean;
      reason?: string;
    },
    key?: string,
  ) {
    if (!context.roles.some((role) => POST.has(role))) throw new Error("FORBIDDEN");
    const id = await this.store.findIdByExternalReference?.(
      context.organizationId,
      system,
      externalId,
    );
    if (!id) throw new Error("RESOURCE_NOT_FOUND");
    return this.reclassifyFunding(context, id, expectedVersion, input, key);
  }
  async reclassifyAccounts(
    context: ExpenseContext,
    id: string,
    expectedVersion: string,
    input: {
      lines: ReadonlyArray<{
        lineNumber: number;
        postingAccountCode?: string;
        categoryCode?: string;
      }>;
      postReplacement?: boolean;
      reason?: string;
    },
    key?: string,
  ) {
    if (!context.roles.some((role) => POST.has(role))) throw new Error("FORBIDDEN");
    if (!key) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    if (!expectedVersion) throw new Error("VERSION_CONFLICT");
    const reason = input.reason?.trim() ?? "";
    if (!reason || !Array.isArray(input.lines) || input.lines.length === 0) {
      throw new Error("VALIDATION_FAILED");
    }
    const existing = await this.store.get(context.organizationId, id);
    if (!existing) throw new Error("RESOURCE_NOT_FOUND");

    const patchByLine = new Map(input.lines.map((l) => [l.lineNumber, l]));
    for (const patch of input.lines) {
      if (patch.postingAccountCode) {
        const root = await this.store.accountRootType?.(
          context.organizationId,
          patch.postingAccountCode.trim(),
        );
        if (!root || !["expense", "asset"].includes(root)) {
          throw new Error("VALIDATION_FAILED");
        }
      }
    }
    const baseMerged = this.mergeExpense(existing, {});
    const updatedLines = baseMerged.lines.map((line, index) => {
      const patch = patchByLine.get(index + 1);
      if (!patch) return line;
      const nextCode = patch.postingAccountCode?.trim() || line.postingAccountCode;
      const nextCat = patch.categoryCode?.trim() || line.expenseCategoryCode;
      return {
        ...line,
        postingAccountCode: nextCode,
        ...(nextCat ? { expenseCategoryCode: nextCat } : {}),
      };
    });
    const replacement: CreateExpenseInput = {
      ...baseMerged,
      id: this.replacementId(context.organizationId, id, key),
      lines: updatedLines,
    };
    const replaced = await this.reverseReplace(
      context,
      id,
      expectedVersion,
      replacement,
      reason,
      key,
    );
    const shouldAutoPost =
      input.postReplacement ??
      (context.roles.includes("owner") &&
        (await this.store.isSolopreneur?.(context.organizationId)));
    const replacementId = (replaced.data as { replacementExpenseId?: string }).replacementExpenseId;
    if (
      shouldAutoPost &&
      replacementId &&
      !(replaced.data as { idempotencyReplayed?: boolean }).idempotencyReplayed
    ) {
      await this.transition(context, replacementId, "submit", { reason }, `${key}:submit`);
      await this.transition(context, replacementId, "approve", { reason }, `${key}:approve`);
      await this.transition(context, replacementId, "post", { reason }, `${key}:post`);
      return {
        ...replaced,
        data: { ...(replaced.data as Record<string, unknown>), replacementState: "posted" },
      };
    }
    return {
      ...replaced,
      data: {
        ...(replaced.data as Record<string, unknown>),
        replacementState: shouldAutoPost ? "posted" : "draft",
      },
    };
  }
  private replacementId(organizationId: string, id: string, key: string) {
    const hex = createHash("sha256").update(`${organizationId}:${id}:${key}`).digest("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  }
  async commitRelationshipBackfill(
    context: ExpenseContext,
    id: string,
    expectedVersion: string,
    replacement: CreateExpenseInput,
    reason: string,
    planHash: string,
    key?: string,
  ) {
    const normalized = normalizeExpenseRelationships(replacement);
    const expectedPlanHash = createHash("sha256")
      .update(
        JSON.stringify({ id, expectedVersion, replacement: normalized, reason: reason.trim() }),
      )
      .digest("hex");
    if (expectedPlanHash !== planHash) throw new Error("RELATIONSHIP_BACKFILL_PLAN_MISMATCH");
    return this.reverseReplace(context, id, expectedVersion, normalized, reason, key);
  }
  async transition(
    context: ExpenseContext,
    id: string,
    action: string,
    input: { reason?: string; missingEvidenceTypes?: string[] },
    key?: string,
  ) {
    const roles =
      action === "approve" ? REVIEW : ["post", "cancel"].includes(action) ? POST : WRITE;
    if (!context.roles.some((r) => roles.has(r))) throw new Error("FORBIDDEN");
    if (!key) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    const allowDefault =
      ROUTINE_EXPENSE_ACTIONS.has(action) &&
      context.roles.includes("owner") &&
      Boolean(await this.store.isSolopreneur?.(context.organizationId));
    const effectiveReason = resolveRoutineActionReason(input?.reason, allowDefault);
    if (!effectiveReason) throw new Error("VALIDATION_FAILED");
    if (action === "post") {
      const existing = await this.store.get?.(context.organizationId, id);
      if (existing?.currency)
        await assertMasterBaseCurrency(this.master, context.organizationId, existing.currency);
    }
    return this.envelope(
      context,
      await this.store.transition(
        context,
        id,
        action,
        effectiveReason,
        input?.missingEvidenceTypes ?? [],
        key,
      ),
    );
  }
  async review(context: ExpenseContext, id: string, input: ExpenseReviewInput, key?: string) {
    const roles = input.axis === "management" ? REVIEW : TAX_REVIEW;
    if (!context.roles.some((r) => roles.has(r))) throw new Error("FORBIDDEN");
    if (!key) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    if (!Number.isInteger(input.lineNumber) || input.lineNumber < 1 || !input.reason?.trim())
      throw new Error("VALIDATION_FAILED");
    if (input.state === "accountant_override" && !input.reference?.trim())
      throw new Error("ACCOUNTANT_OVERRIDE_REFERENCE_REQUIRED");
    return this.envelope(context, await this.store.review(context, id, input, key));
  }
  private validate(input: CreateExpenseInput) {
    validateExpensePayload(input);
  }
}
