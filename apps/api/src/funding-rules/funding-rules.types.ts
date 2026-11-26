import type {
  FundingInputContract,
  FundingRuleContract,
  FundingRuleMatchContract,
  FundingTypeContract,
  OrganizationFundingDefaultContract,
} from "@naai-erp/contracts";

export const FUNDING_RULES_STORE = Symbol("FUNDING_RULES_STORE");

export type FundingRulesContext = Readonly<{
  organizationId: string;
  actorId: string;
  roles: readonly string[];
  correlationId: string;
}>;

export type CreateFundingRuleInput = Readonly<{
  id?: string;
  name: string;
  priority?: number;
  isActive?: boolean;
  match?: FundingRuleMatchContract;
  target: FundingInputContract;
}>;

export type UpdateFundingRuleInput = Readonly<{
  name?: string;
  priority?: number;
  isActive?: boolean;
  match?: FundingRuleMatchContract;
  target?: FundingInputContract;
}>;

export type FundingRuleTestInput = Readonly<{
  externalSystem?: string | undefined;
  supplierTaxId?: string | undefined;
  partyId?: string | undefined;
  categoryCode?: string | undefined;
  description?: string | undefined;
  grossMinor?: string | undefined;
  explicitFunding?: FundingInputContract | undefined;
}>;

export type FundingResolutionResult = Readonly<{
  resolvedFunding: FundingInputContract;
  source: "explicit" | "rule" | "organization_default" | "system_default";
  matchedRule: FundingRuleContract | null;
}>;

export const ALLOWED_FUNDING_TYPES: readonly FundingTypeContract[] = [
  "company_bank",
  "company_cash",
  "owner_paid",
  "owner_custody_cash",
];

function norm(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/**
 * Pure priority-ordered funding rule evaluator:
 * 1. Explicit funding in the payload always wins.
 * 2. First active rule (ordered by priority asc, createdAt asc, id asc) whose non-null matchers
 *    all match the candidate wins.
 * 3. Otherwise the organization default (or `owner_paid` fallback) is returned.
 */
export function matchFundingRule(
  rules: readonly FundingRuleContract[],
  orgDefault: OrganizationFundingDefaultContract | null,
  candidate: FundingRuleTestInput,
): FundingResolutionResult {
  if (candidate.explicitFunding) {
    return {
      resolvedFunding: candidate.explicitFunding,
      source: "explicit",
      matchedRule: null,
    };
  }
  const ordered = [...rules]
    .filter((r) => r.isActive)
    .sort(
      (a, b) =>
        a.priority - b.priority ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id),
    );

  const extSys = norm(candidate.externalSystem);
  const taxId = (candidate.supplierTaxId ?? "").trim();
  const cat = norm(candidate.categoryCode);
  const desc = norm(candidate.description);
  const amount =
    candidate.grossMinor !== undefined && candidate.grossMinor !== ""
      ? BigInt(candidate.grossMinor)
      : undefined;

  for (const rule of ordered) {
    const m = rule.match;
    if (m.externalSystem && norm(m.externalSystem) !== extSys) continue;
    if (m.supplierTaxId && m.supplierTaxId.trim() !== taxId) continue;
    if (m.categoryCode && norm(m.categoryCode) !== cat) continue;
    if (m.keyword && !desc.includes(norm(m.keyword))) continue;
    if (m.minAmountMinor !== null && m.minAmountMinor !== undefined) {
      if (amount === undefined || amount < BigInt(m.minAmountMinor)) continue;
    }
    if (m.maxAmountMinor !== null && m.maxAmountMinor !== undefined) {
      if (amount === undefined || amount > BigInt(m.maxAmountMinor)) continue;
    }
    return {
      resolvedFunding: rule.target,
      source: "rule",
      matchedRule: rule,
    };
  }

  if (orgDefault) {
    return {
      resolvedFunding: orgDefault.defaultFunding,
      source: "organization_default",
      matchedRule: null,
    };
  }

  return {
    resolvedFunding: { type: "owner_paid" },
    source: "system_default",
    matchedRule: null,
  };
}

export interface FundingRulesStore {
  list(organizationId: string): Promise<{
    defaultFunding: OrganizationFundingDefaultContract;
    rules: readonly FundingRuleContract[];
  }>;
  setDefault(
    context: FundingRulesContext,
    funding: FundingInputContract,
    idempotencyKey: string,
  ): Promise<{ defaultFunding: OrganizationFundingDefaultContract; idempotencyReplayed: boolean }>;
  createRule(
    context: FundingRulesContext,
    input: CreateFundingRuleInput,
    idempotencyKey: string,
  ): Promise<{ rule: FundingRuleContract; idempotencyReplayed: boolean }>;
  updateRule(
    context: FundingRulesContext,
    ruleId: string,
    expectedVersion: string,
    input: UpdateFundingRuleInput,
    idempotencyKey: string,
  ): Promise<{ rule: FundingRuleContract; idempotencyReplayed: boolean }>;
  deleteRule(
    context: FundingRulesContext,
    ruleId: string,
    expectedVersion: string,
    idempotencyKey: string,
  ): Promise<{ deleted: true; ruleId: string; idempotencyReplayed: boolean }>;
  findPartyTaxId(organizationId: string, partyId: string): Promise<string | undefined>;
}
