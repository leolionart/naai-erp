import type { CreateExpenseInput, ExpenseContext, ExpenseMetadataInput } from "./expense.types.js";
import { POST, WRITE } from "./expense.service.shared.js";
import type { ExpenseService } from "./expense.service.js";

export async function updateMetadataOperation(
  this: ExpenseService,
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

/**
 * Moves a posted expense to another payment source (company cash/bank, owner-held custody cash or
 * owner-paid). The replacement is rebuilt from the stored record, so callers send only the target:
 * `financialAccountId` for a financial account (needed to tell the owner-held custody cash apart
 * from company cash, which share one ledger account) or `counterAccountCode` for a ledger source
 * such as the owner-current account. The old journal is reversed and a draft replacement created.
 */
export async function reclassifyFundingOperation(
  this: ExpenseService,
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
  if (!reason || (!financialAccountId && !counterAccountCode)) throw new Error("VALIDATION_FAILED");
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
    (context.roles.includes("owner") && (await this.store.isSolopreneur?.(context.organizationId)));
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

export async function reclassifyAccountsOperation(
  this: ExpenseService,
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
    (context.roles.includes("owner") && (await this.store.isSolopreneur?.(context.organizationId)));
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
