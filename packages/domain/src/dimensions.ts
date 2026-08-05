import { organizationId, type OrganizationId } from "./organization.js";

export const DIMENSION_KINDS = [
  "cost_center",
  "service_line",
  "category",
  "client",
  "project",
  "contract",
] as const;
export type DimensionKind = (typeof DIMENSION_KINDS)[number];

export type DimensionValue = Readonly<{
  organizationId: OrganizationId;
  kind: DimensionKind;
  code: string;
  name: string;
  isActive: boolean;
}>;

export type DimensionRule = Readonly<{
  organizationId: OrganizationId;
  accountCode: string;
  requiredKinds: readonly DimensionKind[];
  effectiveFrom: string;
  effectiveTo?: string;
}>;

export type Allocation = Readonly<{
  dimensionKind: DimensionKind;
  dimensionCode: string;
  percentage: string;
  roundingResidualMinor?: bigint;
  residualAccountCode?: string;
}>;

export type AmountAllocation = Readonly<{
  dimensionKind: DimensionKind;
  dimensionCode: string;
  amountMinor: bigint;
}>;

export type DefaultMapping = Readonly<{
  organizationId: OrganizationId;
  categoryCode: string;
  accountCode: string;
  taxCode?: string;
  taxEffectiveFrom?: string;
  defaultCostCenterCode?: string;
  defaultServiceLineCode?: string;
  effectiveFrom: string;
  effectiveTo?: string;
}>;

const PERCENT_SCALE = 6;

function required(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function percentUnits(value: string): bigint {
  if (!/^(?:0|[1-9]\d{0,2})(?:\.\d{1,6})?$/.test(value)) {
    throw new Error("Allocation percentage must be an exact decimal from 0 to 100");
  }
  const [whole = "0", fraction = ""] = value.split(".");
  const units =
    BigInt(whole) * 10n ** BigInt(PERCENT_SCALE) + BigInt(fraction.padEnd(PERCENT_SCALE, "0"));
  if (units <= 0n || units > 100n * 10n ** BigInt(PERCENT_SCALE)) {
    throw new Error("Allocation percentage must be greater than 0 and at most 100");
  }
  return units;
}

export function createDimensionValue(input: {
  organizationId: string;
  kind: DimensionKind;
  code: string;
  name: string;
}): DimensionValue {
  return {
    organizationId: organizationId(input.organizationId),
    kind: input.kind,
    code: required(input.code, "Dimension code"),
    name: required(input.name, "Dimension name"),
    isActive: true,
  };
}

export function createDimensionRule(input: {
  organizationId: string;
  accountCode: string;
  requiredKinds: readonly DimensionKind[];
  effectiveFrom: string;
  effectiveTo?: string;
}): DimensionRule {
  const requiredKinds = [...new Set(input.requiredKinds)];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom))
    throw new Error("Rule effective-from must be an ISO date");
  if (input.effectiveTo && input.effectiveTo <= input.effectiveFrom)
    throw new Error("Rule effective-to must follow effective-from");
  return {
    organizationId: organizationId(input.organizationId),
    accountCode: required(input.accountCode, "Account code"),
    requiredKinds,
    effectiveFrom: input.effectiveFrom,
    ...(input.effectiveTo ? { effectiveTo: input.effectiveTo } : {}),
  };
}

export function validateRequiredDimensions(
  rule: DimensionRule,
  values: readonly Pick<DimensionValue, "organizationId" | "kind" | "code">[],
): void {
  for (const value of values) {
    if (value.organizationId !== rule.organizationId)
      throw new Error("Dimension value belongs to another organization");
  }
  const present = new Set(values.map((value) => value.kind));
  const missing = rule.requiredKinds.filter((kind) => !present.has(kind));
  if (missing.length) throw new Error(`Missing required dimensions: ${missing.join(", ")}`);
}

export function validateAllocations(allocations: readonly Allocation[]): void {
  if (allocations.length === 0) throw new Error("At least one allocation is required");
  const total = allocations.reduce(
    (sum, allocation) => sum + percentUnits(allocation.percentage),
    0n,
  );
  if (total !== 100n * 10n ** BigInt(PERCENT_SCALE))
    throw new Error("Allocation percentages must total exactly 100");
  for (const allocation of allocations) {
    const hasResidual =
      allocation.roundingResidualMinor !== undefined && allocation.roundingResidualMinor !== 0n;
    if (hasResidual && !allocation.residualAccountCode) {
      throw new Error("Rounding residual requires an explicit residual account");
    }
  }
}

export function validateAmountAllocations(
  sourceAmountMinor: bigint,
  allocations: readonly AmountAllocation[],
): void {
  if (sourceAmountMinor <= 0n) throw new Error("Source amount must be positive");
  if (allocations.length === 0) throw new Error("At least one allocation is required");
  if (allocations.some((allocation) => allocation.amountMinor <= 0n)) {
    throw new Error("Allocated amounts must be positive");
  }
  const total = allocations.reduce((sum, allocation) => sum + allocation.amountMinor, 0n);
  if (total !== sourceAmountMinor)
    throw new Error("Allocated amounts must total the source amount exactly");
}

export function createDefaultMapping(input: {
  organizationId: string;
  categoryCode: string;
  accountCode: string;
  taxCode?: string;
  taxEffectiveFrom?: string;
  defaultCostCenterCode?: string;
  defaultServiceLineCode?: string;
  effectiveFrom: string;
  effectiveTo?: string;
}): DefaultMapping {
  if (Boolean(input.taxCode) !== Boolean(input.taxEffectiveFrom)) {
    throw new Error("Tax mapping requires both code and version effective date");
  }
  const rule = createDimensionRule({
    organizationId: input.organizationId,
    accountCode: input.accountCode,
    requiredKinds: [],
    effectiveFrom: input.effectiveFrom,
    ...(input.effectiveTo ? { effectiveTo: input.effectiveTo } : {}),
  });
  return {
    organizationId: rule.organizationId,
    categoryCode: required(input.categoryCode, "Category code"),
    accountCode: rule.accountCode,
    ...(input.taxCode ? { taxCode: input.taxCode, taxEffectiveFrom: input.taxEffectiveFrom! } : {}),
    ...(input.defaultCostCenterCode ? { defaultCostCenterCode: input.defaultCostCenterCode } : {}),
    ...(input.defaultServiceLineCode
      ? { defaultServiceLineCode: input.defaultServiceLineCode }
      : {}),
    effectiveFrom: rule.effectiveFrom,
    ...(rule.effectiveTo ? { effectiveTo: rule.effectiveTo } : {}),
  };
}
