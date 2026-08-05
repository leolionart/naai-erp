export type ProjectBudgetState = "draft" | "submitted" | "approved" | "rejected" | "superseded";
export type ProjectBudgetKind = "baseline" | "revision";
export type ProjectBudgetCategory =
  "revenue" | "labor" | "freelancer" | "vendor" | "tool" | "travel" | "overhead";
export type ScopeChangeState = "draft" | "submitted" | "approved" | "rejected";

export type ProjectBudgetLine = Readonly<{
  id: string;
  category: ProjectBudgetCategory;
  amountMinor: bigint;
  serviceLineCode?: string;
  milestoneId?: string;
  note?: string;
}>;

export type ProjectBudgetVersion = Readonly<{
  organizationId: string;
  id: string;
  projectId: string;
  versionNumber: number;
  kind: ProjectBudgetKind;
  previousVersionId?: string;
  scopeChangeId?: string;
  currency: string;
  effectiveOn: string;
  state: ProjectBudgetState;
  lines: readonly ProjectBudgetLine[];
  revenueTotalMinor: bigint;
  directCostTotalMinor: bigint;
  overheadTotalMinor: bigint;
  version: number;
  submittedBy?: string;
  approvedBy?: string;
  rejectedBy?: string;
}>;

export type ScopeChange = Readonly<{
  organizationId: string;
  id: string;
  projectId: string;
  reason: string;
  expectedRevenueImpactMinor: bigint;
  expectedCostImpactMinor: bigint;
  expectedScheduleImpactDays: number;
  evidenceIds: readonly string[];
  state: ScopeChangeState;
  version: number;
  submittedBy?: string;
  approvedBy?: string;
  rejectedBy?: string;
}>;

const required = (value: string, label: string): string => {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
};

function isoDate(value: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`${label} must be an ISO date`);
  }
  return value;
}

function currency(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) throw new Error("Budget currency must be ISO-4217");
  return normalized;
}

export function createScopeChange(input: {
  organizationId: string;
  id: string;
  projectId: string;
  reason: string;
  expectedRevenueImpactMinor: bigint;
  expectedCostImpactMinor: bigint;
  expectedScheduleImpactDays: number;
  evidenceIds?: readonly string[];
}): ScopeChange {
  if (!Number.isInteger(input.expectedScheduleImpactDays)) {
    throw new Error("Scope change schedule impact must be an integer number of days");
  }
  return Object.freeze({
    organizationId: required(input.organizationId, "Scope change organization ID"),
    id: required(input.id, "Scope change ID"),
    projectId: required(input.projectId, "Scope change project ID"),
    reason: required(input.reason, "Scope change reason"),
    expectedRevenueImpactMinor: input.expectedRevenueImpactMinor,
    expectedCostImpactMinor: input.expectedCostImpactMinor,
    expectedScheduleImpactDays: input.expectedScheduleImpactDays,
    evidenceIds: Object.freeze([...new Set(input.evidenceIds ?? [])].sort()),
    state: "draft",
    version: 1,
  });
}

function transitionScope(
  scope: ScopeChange,
  expected: ScopeChangeState,
  state: ScopeChangeState,
  actorId: string,
): ScopeChange {
  if (scope.state !== expected)
    throw new Error(`Invalid scope change transition: ${scope.state} -> ${state}`);
  const actor = required(actorId, "Scope change actor");
  return Object.freeze({
    ...scope,
    state,
    version: scope.version + 1,
    ...(state === "submitted" ? { submittedBy: actor } : {}),
    ...(state === "approved" ? { approvedBy: actor } : {}),
    ...(state === "rejected" ? { rejectedBy: actor } : {}),
  });
}

export const submitScopeChange = (scope: ScopeChange, actorId: string) =>
  transitionScope(scope, "draft", "submitted", actorId);

export function approveScopeChange(
  scope: ScopeChange,
  actorId: string,
  allowSelfApproval = false,
): ScopeChange {
  if (!allowSelfApproval && scope.submittedBy === actorId)
    throw new Error("SCOPE_CHANGE_MAKER_CHECKER_VIOLATION");
  return transitionScope(scope, "submitted", "approved", actorId);
}

export const rejectScopeChange = (scope: ScopeChange, actorId: string) =>
  transitionScope(scope, "submitted", "rejected", actorId);

export function createProjectBudgetVersion(input: {
  organizationId: string;
  id: string;
  projectId: string;
  versionNumber: number;
  kind: ProjectBudgetKind;
  previousVersionId?: string;
  scopeChange?: ScopeChange;
  currency: string;
  effectiveOn: string;
  lines: readonly ProjectBudgetLine[];
}): ProjectBudgetVersion {
  if (!Number.isInteger(input.versionNumber) || input.versionNumber < 1) {
    throw new Error("Budget version number must be positive");
  }
  if (!input.lines.length) throw new Error("Budget version requires at least one line");
  if (input.kind === "baseline" && (input.previousVersionId || input.scopeChange)) {
    throw new Error("Baseline budget cannot reference a previous version or scope change");
  }
  if (input.kind === "revision") {
    if (!input.previousVersionId?.trim())
      throw new Error("Budget revision requires previous version");
    if (!input.scopeChange || input.scopeChange.state !== "approved") {
      throw new Error("Budget revision requires an approved scope change");
    }
    if (input.scopeChange.projectId !== input.projectId)
      throw new Error("Budget scope change belongs to another project");
  }
  const ids = new Set<string>();
  const lines = input.lines.map((line) => {
    const id = required(line.id, "Budget line ID");
    if (ids.has(id)) throw new Error("Budget line IDs must be unique");
    ids.add(id);
    if (line.amountMinor < 0n) throw new Error("Budget line amount cannot be negative");
    return Object.freeze({ ...line, id });
  });
  const total = (categories: readonly ProjectBudgetCategory[]) =>
    lines
      .filter((line) => categories.includes(line.category))
      .reduce((sum, line) => sum + line.amountMinor, 0n);
  return Object.freeze({
    organizationId: required(input.organizationId, "Budget organization ID"),
    id: required(input.id, "Budget version ID"),
    projectId: required(input.projectId, "Budget project ID"),
    versionNumber: input.versionNumber,
    kind: input.kind,
    ...(input.previousVersionId ? { previousVersionId: input.previousVersionId.trim() } : {}),
    ...(input.scopeChange ? { scopeChangeId: input.scopeChange.id } : {}),
    currency: currency(input.currency),
    effectiveOn: isoDate(input.effectiveOn, "Budget effective date"),
    state: "draft",
    lines: Object.freeze(lines),
    revenueTotalMinor: total(["revenue"]),
    directCostTotalMinor: total(["labor", "freelancer", "vendor", "tool", "travel"]),
    overheadTotalMinor: total(["overhead"]),
    version: 1,
  });
}

export function assertBudgetVersionSequence(
  candidate: ProjectBudgetVersion,
  existing: readonly ProjectBudgetVersion[],
): void {
  const project = existing.filter(
    (budget) =>
      budget.organizationId === candidate.organizationId &&
      budget.projectId === candidate.projectId,
  );
  if (
    project.some(
      (budget) => budget.versionNumber === candidate.versionNumber || budget.id === candidate.id,
    )
  ) {
    throw new Error("Budget version identity and number must be unique by project");
  }
  const approved = project.filter((budget) => budget.state === "approved");
  if (candidate.kind === "baseline" && approved.some((budget) => budget.kind === "baseline")) {
    throw new Error("Project already has an approved baseline budget");
  }
  if (candidate.kind === "revision") {
    const previous = project.find((budget) => budget.id === candidate.previousVersionId);
    if (!previous || previous.state !== "approved")
      throw new Error("Budget revision previous version must be approved");
    const maximum = project.reduce((max, budget) => Math.max(max, budget.versionNumber), 0);
    if (candidate.versionNumber !== maximum + 1)
      throw new Error("Budget revision version must be sequential");
  }
}

function transitionBudget(
  budget: ProjectBudgetVersion,
  expected: ProjectBudgetState,
  state: ProjectBudgetState,
  actorId: string,
): ProjectBudgetVersion {
  if (budget.state !== expected)
    throw new Error(`Invalid budget transition: ${budget.state} -> ${state}`);
  const actor = required(actorId, "Budget actor");
  return Object.freeze({
    ...budget,
    state,
    version: budget.version + 1,
    ...(state === "submitted" ? { submittedBy: actor } : {}),
    ...(state === "approved" ? { approvedBy: actor } : {}),
    ...(state === "rejected" ? { rejectedBy: actor } : {}),
  });
}

export const submitProjectBudgetVersion = (budget: ProjectBudgetVersion, actorId: string) =>
  transitionBudget(budget, "draft", "submitted", actorId);

export function approveProjectBudgetVersion(
  budget: ProjectBudgetVersion,
  existing: readonly ProjectBudgetVersion[],
  actorId: string,
  allowSelfApproval = false,
): ProjectBudgetVersion {
  if (!allowSelfApproval && budget.submittedBy === actorId)
    throw new Error("BUDGET_MAKER_CHECKER_VIOLATION");
  assertBudgetVersionSequence(budget, existing);
  return transitionBudget(budget, "submitted", "approved", actorId);
}

export const rejectProjectBudgetVersion = (budget: ProjectBudgetVersion, actorId: string) =>
  transitionBudget(budget, "submitted", "rejected", actorId);

export function supersedeProjectBudgetVersion(budget: ProjectBudgetVersion): ProjectBudgetVersion {
  if (budget.state !== "approved") throw new Error("Only approved budget can be superseded");
  return Object.freeze({ ...budget, state: "superseded", version: budget.version + 1 });
}
