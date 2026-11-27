import { assertMasterBaseCurrency } from "../common/base-currency-guard.js";
import { validateCommercialDocumentFunding } from "./commercial-document-funding.validator.js";
import type {
  CommercialDocumentContext,
  CreateCommercialDocumentInput,
  DocumentAllocationInput,
} from "./commercial-document.types.js";
import { POST_ROLES, WRITE_ROLES } from "./commercial-document.service.shared.js";
import type { CommercialDocumentService } from "./commercial-document.service.js";

export async function createOperation(
  this: CommercialDocumentService,
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

export async function reclassifyFundingOperation(
  this: CommercialDocumentService,
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
    await this.transition(context, replacementId, "verify", { reason }, `${idempotencyKey}:verify`);
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

export async function reclassifyAccountsOperation(
  this: CommercialDocumentService,
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
      await this.transition(context, replacementId, "issue", { reason }, `${idempotencyKey}:issue`);
      return this.envelope(context, { ...result, replacementState: "issued" });
    }
    await this.transition(
      context,
      replacementId,
      "capture",
      { reason },
      `${idempotencyKey}:capture`,
    );
    await this.transition(context, replacementId, "verify", { reason }, `${idempotencyKey}:verify`);
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

export function validateOperation(
  this: CommercialDocumentService,
  input: CreateCommercialDocumentInput,
) {
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
