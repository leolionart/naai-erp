import { createDraftJournal, type JournalDimensions, type JournalEntry } from "./journal.js";
import { organizationId, type OrganizationId } from "./organization.js";

export const POSTING_DIMENSIONS = [
  "client",
  "project",
  "cost_center",
  "service_line",
  "tax",
] as const;
export type PostingDimension = (typeof POSTING_DIMENSIONS)[number];

export type PostingRule = Readonly<{
  organizationId: OrganizationId;
  id: string;
  version: number;
  documentType: string;
  sourceAccountId?: string;
  categoryCode?: string;
  taxCode?: string;
  effectiveFrom: string;
  effectiveTo?: string;
  debitAccountId: string;
  creditAccountId: string;
  requiredDimensions: readonly PostingDimension[];
}>;

export type PostingSourceLine = Readonly<{
  id: string;
  amountMinor: bigint;
  sourceAccountId?: string;
  categoryCode?: string;
  taxCode?: string;
  description?: string;
  dimensions?: JournalDimensions;
}>;

export type AppliedPostingRule = Readonly<{
  sourceLineId: string;
  ruleId: string;
  ruleVersion: number;
}>;

export type PostingDraftResult = Readonly<{
  journal: JournalEntry;
  appliedRules: readonly AppliedPostingRule[];
}>;

export type ProtectedManualAccount = Readonly<{
  accountId: string;
  protection: "blocked" | "elevated";
}>;

function required(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function date(value: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`${label} must be an ISO date`);
  }
  return value;
}

export function createPostingRule(input: {
  organizationId: string;
  id: string;
  version: number;
  documentType: string;
  sourceAccountId?: string;
  categoryCode?: string;
  taxCode?: string;
  effectiveFrom: string;
  effectiveTo?: string;
  debitAccountId: string;
  creditAccountId: string;
  requiredDimensions?: readonly PostingDimension[];
}): PostingRule {
  if (!Number.isSafeInteger(input.version) || input.version <= 0) {
    throw new Error("Posting rule version must be a positive safe integer");
  }
  const effectiveFrom = date(input.effectiveFrom, "Posting rule effective-from");
  const effectiveTo = input.effectiveTo
    ? date(input.effectiveTo, "Posting rule effective-to")
    : undefined;
  if (effectiveTo && effectiveTo < effectiveFrom) {
    throw new Error("Posting rule effective-to cannot precede effective-from");
  }
  const debitAccountId = required(input.debitAccountId, "Debit account ID");
  const creditAccountId = required(input.creditAccountId, "Credit account ID");
  if (debitAccountId === creditAccountId) {
    throw new Error("Posting rule debit and credit accounts must differ");
  }
  return Object.freeze({
    organizationId: organizationId(input.organizationId),
    id: required(input.id, "Posting rule ID"),
    version: input.version,
    documentType: required(input.documentType, "Document type"),
    ...(input.sourceAccountId?.trim() ? { sourceAccountId: input.sourceAccountId.trim() } : {}),
    ...(input.categoryCode?.trim() ? { categoryCode: input.categoryCode.trim() } : {}),
    ...(input.taxCode?.trim() ? { taxCode: input.taxCode.trim() } : {}),
    effectiveFrom,
    ...(effectiveTo ? { effectiveTo } : {}),
    debitAccountId,
    creditAccountId,
    requiredDimensions: Object.freeze([...new Set(input.requiredDimensions ?? [])]),
  });
}

function specificity(rule: PostingRule): number {
  return (
    Number(rule.sourceAccountId !== undefined) +
    Number(rule.categoryCode !== undefined) +
    Number(rule.taxCode !== undefined)
  );
}

export function selectPostingRule(
  rules: readonly PostingRule[],
  input: {
    organizationId: string;
    documentType: string;
    postingDate: string;
    sourceAccountId?: string;
    categoryCode?: string;
    taxCode?: string;
  },
): PostingRule {
  const orgId = organizationId(input.organizationId);
  const postingDate = date(input.postingDate, "Posting date");
  const matches = rules.filter(
    (rule) =>
      rule.organizationId === orgId &&
      rule.documentType === input.documentType &&
      rule.effectiveFrom <= postingDate &&
      (!rule.effectiveTo || rule.effectiveTo >= postingDate) &&
      (!rule.sourceAccountId || rule.sourceAccountId === input.sourceAccountId) &&
      (!rule.categoryCode || rule.categoryCode === input.categoryCode) &&
      (!rule.taxCode || rule.taxCode === input.taxCode),
  );
  matches.sort(
    (left, right) =>
      specificity(right) - specificity(left) ||
      right.effectiveFrom.localeCompare(left.effectiveFrom) ||
      right.version - left.version ||
      left.id.localeCompare(right.id),
  );
  const selected = matches[0];
  if (!selected) throw new Error("No effective posting rule matches the source line");
  return selected;
}

function assertRequiredDimensions(
  requiredDimensions: readonly PostingDimension[],
  dimensions: JournalDimensions,
): void {
  const values: Record<PostingDimension, string | undefined> = {
    client: dimensions.clientId,
    project: dimensions.projectId,
    cost_center: dimensions.costCenterCode,
    service_line: dimensions.serviceLineCode,
    tax: dimensions.taxCode,
  };
  const missing = requiredDimensions.filter((dimension) => !values[dimension]?.trim());
  if (missing.length) throw new Error(`Missing required posting dimensions: ${missing.join(", ")}`);
}

export function mapDocumentToJournalDraft(input: {
  organizationId: string;
  journalId: string;
  documentType: string;
  documentId: string;
  postingDate: string;
  baseCurrency: string;
  description: string;
  sourceLines: readonly PostingSourceLine[];
  rules: readonly PostingRule[];
}): PostingDraftResult {
  if (!input.sourceLines.length) throw new Error("Source document requires at least one line");
  const journalLines: Array<{
    id: string;
    accountId: string;
    description?: string;
    debitMinor?: bigint;
    creditMinor?: bigint;
    dimensions: JournalDimensions;
  }> = [];
  const appliedRules: AppliedPostingRule[] = [];

  for (const sourceLine of input.sourceLines) {
    if (sourceLine.amountMinor <= 0n) throw new Error("Source line amount must be positive");
    const sourceLineId = required(sourceLine.id, "Source line ID");
    const rule = selectPostingRule(input.rules, {
      organizationId: input.organizationId,
      documentType: input.documentType,
      postingDate: input.postingDate,
      ...(sourceLine.sourceAccountId ? { sourceAccountId: sourceLine.sourceAccountId } : {}),
      ...(sourceLine.categoryCode ? { categoryCode: sourceLine.categoryCode } : {}),
      ...(sourceLine.taxCode ? { taxCode: sourceLine.taxCode } : {}),
    });
    const dimensions = Object.freeze({
      ...(sourceLine.dimensions ?? {}),
      ...(sourceLine.taxCode && !sourceLine.dimensions?.taxCode
        ? { taxCode: sourceLine.taxCode }
        : {}),
    });
    assertRequiredDimensions(rule.requiredDimensions, dimensions);
    const description = sourceLine.description?.trim();
    journalLines.push(
      {
        id: `${sourceLineId}-debit`,
        accountId: rule.debitAccountId,
        ...(description ? { description } : {}),
        debitMinor: sourceLine.amountMinor,
        dimensions,
      },
      {
        id: `${sourceLineId}-credit`,
        accountId: rule.creditAccountId,
        ...(description ? { description } : {}),
        creditMinor: sourceLine.amountMinor,
        dimensions,
      },
    );
    appliedRules.push(Object.freeze({ sourceLineId, ruleId: rule.id, ruleVersion: rule.version }));
  }

  return Object.freeze({
    journal: createDraftJournal({
      organizationId: input.organizationId,
      id: input.journalId,
      entryDate: input.postingDate,
      baseCurrency: input.baseCurrency,
      description: input.description,
      lines: journalLines,
    }),
    appliedRules: Object.freeze(appliedRules),
  });
}

export function assertManualJournalAllowed(input: {
  accountIds: readonly string[];
  protectedAccounts: readonly ProtectedManualAccount[];
  hasManualJournalPermission: boolean;
  hasElevatedProtectedAccountPermission: boolean;
}): void {
  if (!input.hasManualJournalPermission) {
    throw new Error("Manual journal permission is required");
  }
  const policies = new Map(
    input.protectedAccounts.map((policy) => [
      required(policy.accountId, "Protected account ID"),
      policy,
    ]),
  );
  for (const accountId of new Set(input.accountIds)) {
    const policy = policies.get(accountId);
    if (!policy) continue;
    if (policy.protection === "blocked") {
      throw new Error(`Manual posting to protected account ${accountId} is blocked`);
    }
    if (!input.hasElevatedProtectedAccountPermission) {
      throw new Error(
        `Manual posting to protected account ${accountId} requires elevated permission`,
      );
    }
  }
}
