import { organizationId, type OrganizationId } from "./organization.js";

export const ACCOUNT_ROOT_TYPES = ["asset", "liability", "equity", "revenue", "expense"] as const;
export type AccountRootType = (typeof ACCOUNT_ROOT_TYPES)[number];

export type Account = Readonly<{
  organizationId: OrganizationId;
  code: string;
  name: string;
  rootType: AccountRootType;
  parentCode?: string;
  isControlAccount: boolean;
  allowManualPosting: boolean;
  isActive: boolean;
}>;

export type StatutoryFramework = "TT133" | "TT200";

export type StatutoryAccountMapping = Readonly<{
  organizationId: OrganizationId;
  accountCode: string;
  framework: StatutoryFramework;
  statutoryCode: string;
  effectiveFrom: string;
  effectiveTo?: string;
}>;

export const TAX_KINDS = ["vat_input", "vat_output", "cit", "withholding", "other"] as const;
export type TaxKind = (typeof TAX_KINDS)[number];
export type TaxReviewState = "draft" | "accountant_approved" | "retired";

export type TaxCodeVersion = Readonly<{
  organizationId: OrganizationId;
  code: string;
  name: string;
  kind: TaxKind;
  rate: string;
  effectiveFrom: string;
  effectiveTo?: string;
  reviewState: TaxReviewState;
  requiredEvidence: readonly string[];
}>;

function requiredText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function isoDate(value: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`${label} must be an ISO date`);
  }
  return value;
}

export function createAccount(input: {
  organizationId: string;
  code: string;
  name: string;
  rootType: AccountRootType;
  parentCode?: string;
  isControlAccount?: boolean;
  allowManualPosting?: boolean;
}): Account {
  const code = requiredText(input.code, "Account code");
  const parentCode = input.parentCode?.trim() || undefined;
  if (parentCode === code) throw new Error("Account cannot be its own parent");
  const isControlAccount = input.isControlAccount ?? false;
  const allowManualPosting = input.allowManualPosting ?? !isControlAccount;
  if (isControlAccount && allowManualPosting) {
    throw new Error("Control accounts cannot allow manual posting by default");
  }
  return {
    organizationId: organizationId(input.organizationId),
    code,
    name: requiredText(input.name, "Account name"),
    rootType: input.rootType,
    ...(parentCode ? { parentCode } : {}),
    isControlAccount,
    allowManualPosting,
    isActive: true,
  };
}

export function updateAccount(
  current: Account,
  changes: Partial<Pick<Account, "name" | "rootType" | "parentCode" | "isActive">>,
  hasLedgerHistory: boolean,
): Account {
  if (hasLedgerHistory && changes.rootType && changes.rootType !== current.rootType) {
    throw new Error("Account root type cannot change after ledger history exists");
  }
  if (changes.parentCode === current.code) throw new Error("Account cannot be its own parent");
  return { ...current, ...changes };
}

export function assertValidAccountParent(account: Account, parent: Account): void {
  if (account.organizationId !== parent.organizationId) {
    throw new Error("Account parent must belong to the same organization");
  }
  if (account.rootType !== parent.rootType) {
    throw new Error("Account parent must have the same root type");
  }
  if (account.code === parent.code) throw new Error("Account cannot be its own parent");
}

export function createStatutoryAccountMapping(input: {
  organizationId: string;
  accountCode: string;
  framework: StatutoryFramework;
  statutoryCode: string;
  effectiveFrom: string;
  effectiveTo?: string;
}): StatutoryAccountMapping {
  const effectiveFrom = isoDate(input.effectiveFrom, "Mapping effective-from");
  const effectiveTo = input.effectiveTo
    ? isoDate(input.effectiveTo, "Mapping effective-to")
    : undefined;
  if (effectiveTo && effectiveTo < effectiveFrom) {
    throw new Error("Mapping effective-to cannot precede effective-from");
  }
  return {
    organizationId: organizationId(input.organizationId),
    accountCode: requiredText(input.accountCode, "Account code"),
    framework: input.framework,
    statutoryCode: requiredText(input.statutoryCode, "Statutory code"),
    effectiveFrom,
    ...(effectiveTo ? { effectiveTo } : {}),
  };
}

export function createTaxCodeVersion(input: {
  organizationId: string;
  code: string;
  name: string;
  kind: TaxKind;
  rate: string;
  effectiveFrom: string;
  effectiveTo?: string;
  reviewState?: TaxReviewState;
  requiredEvidence?: readonly string[];
}): TaxCodeVersion {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(input.rate)) {
    throw new Error("Tax rate must be a non-negative exact decimal string");
  }
  const effectiveFrom = isoDate(input.effectiveFrom, "Tax effective-from");
  const effectiveTo = input.effectiveTo
    ? isoDate(input.effectiveTo, "Tax effective-to")
    : undefined;
  if (effectiveTo && effectiveTo < effectiveFrom) {
    throw new Error("Tax effective-to cannot precede effective-from");
  }
  return {
    organizationId: organizationId(input.organizationId),
    code: requiredText(input.code, "Tax code"),
    name: requiredText(input.name, "Tax code name"),
    kind: input.kind,
    rate: input.rate,
    effectiveFrom,
    ...(effectiveTo ? { effectiveTo } : {}),
    reviewState: input.reviewState ?? "draft",
    requiredEvidence: [...new Set(input.requiredEvidence ?? [])],
  };
}

export function resolveEffectiveVersion<T extends { effectiveFrom: string; effectiveTo?: string }>(
  versions: readonly T[],
  onDate: string,
): T | undefined {
  isoDate(onDate, "Resolution date");
  return versions.find(
    (version) =>
      version.effectiveFrom <= onDate && (!version.effectiveTo || onDate < version.effectiveTo),
  );
}

export function assertNonOverlappingVersions(
  versions: readonly { effectiveFrom: string; effectiveTo?: string }[],
): void {
  const ordered = [...versions].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1]!;
    const current = ordered[index]!;
    if (!previous.effectiveTo || current.effectiveFrom < previous.effectiveTo) {
      throw new Error("Effective-date versions cannot overlap");
    }
  }
}
