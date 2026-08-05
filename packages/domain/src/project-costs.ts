export type ProjectCostBasis = "ledger" | "management";
export type ProjectCostClass =
  "labor" | "freelancer" | "vendor_service" | "project_tool" | "travel" | "other_direct";
export type ProjectCostSourceType =
  | "timesheet_cost"
  | "timesheet_adjustment"
  | "expense_allocation"
  | "purchase_invoice_allocation"
  | "reclassification";
export type CostAllocationDisposition = "unallocated" | "direct" | "overhead_reserved";
export type DirectCostAllocationState = "draft" | "submitted" | "approved" | "posted" | "reversed";

export type ProjectCostSource = Readonly<{
  organizationId: string;
  id: string;
  sourceType: ProjectCostSourceType;
  sourceId: string;
  sourceLineId?: string;
  sourceAllocationId?: string;
  costClass: ProjectCostClass;
  basis: ProjectCostBasis;
  effectiveOn: string;
  currency: string;
  amountMinor: bigint;
  baseAmountMinor: bigint;
  remainingAmountMinor: bigint;
  remainingBaseAmountMinor: bigint;
  disposition: CostAllocationDisposition;
  ledgerAccountCode?: string;
  journalId?: string;
  journalLineId?: string;
  timesheetId?: string;
  workerId?: string;
  evidenceIds: readonly string[];
}>;

export type DirectCostSplit = Readonly<{
  id: string;
  projectId: string;
  projectState: "planned" | "active" | "on_hold" | "completed" | "closed";
  amountMinor: bigint;
  baseAmountMinor: bigint;
}>;

export type DirectCostAllocationEvent = Readonly<{
  sequence: number;
  action: "create" | "submit" | "approve" | "post" | "reverse";
  actorId: string;
  occurredAt: string;
  reason: string;
}>;

export type DirectCostAllocation = Readonly<{
  organizationId: string;
  id: string;
  source: ProjectCostSource;
  splits: readonly DirectCostSplit[];
  state: DirectCostAllocationState;
  version: number;
  events: readonly DirectCostAllocationEvent[];
  submittedBy?: string;
  approvedBy?: string;
  journalId?: string;
  reversalJournalId?: string;
}>;

export type ProjectCostItem = Readonly<{
  organizationId: string;
  id: string;
  projectId: string;
  sourceType: ProjectCostSourceType;
  sourceId: string;
  sourceLineId?: string;
  sourceAllocationId?: string;
  directCostAllocationId?: string;
  costClass: ProjectCostClass;
  basis: ProjectCostBasis;
  effectiveOn: string;
  currency: string;
  amountMinor: bigint;
  baseAmountMinor: bigint;
  ledgerAccountCode?: string;
  journalId?: string;
  journalLineId?: string;
  timesheetId?: string;
  workerId?: string;
  evidenceIds: readonly string[];
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

function timestamp(value: string, label: string): string {
  if (Number.isNaN(Date.parse(value))) throw new Error(`${label} must be an ISO timestamp`);
  return value;
}

function currency(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) throw new Error("Project cost currency must be ISO-4217");
  return normalized;
}

export function createProjectCostSource(input: ProjectCostSource): ProjectCostSource {
  if (input.amountMinor <= 0n || input.baseAmountMinor <= 0n) {
    throw new Error("Project cost source amounts must be positive");
  }
  if (
    input.remainingAmountMinor < 0n ||
    input.remainingBaseAmountMinor < 0n ||
    input.remainingAmountMinor > input.amountMinor ||
    input.remainingBaseAmountMinor > input.baseAmountMinor
  ) {
    throw new Error("Project cost remaining amount must be within source totals");
  }
  if (input.basis === "ledger" && (!input.journalId?.trim() || !input.journalLineId?.trim())) {
    throw new Error("Ledger project cost source requires journal drill-down");
  }
  if (
    input.basis === "management" &&
    (!input.timesheetId?.trim() ||
      !["timesheet_cost", "timesheet_adjustment"].includes(input.sourceType))
  ) {
    throw new Error("Management project cost requires a timesheet source and drill-down");
  }
  return Object.freeze({
    ...input,
    organizationId: required(input.organizationId, "Project cost organization ID"),
    id: required(input.id, "Project cost source ID"),
    sourceId: required(input.sourceId, "Project cost source resource ID"),
    effectiveOn: isoDate(input.effectiveOn, "Project cost effective date"),
    currency: currency(input.currency),
    evidenceIds: Object.freeze([...new Set(input.evidenceIds)].sort()),
  });
}

export function createSourceLinkedProjectCost(input: {
  source: ProjectCostSource;
  projectId: string;
  projectState: "planned" | "active" | "on_hold" | "completed" | "closed";
}): ProjectCostItem {
  const source = createProjectCostSource(input.source);
  if (source.disposition !== "direct") {
    throw new Error("Source-linked project cost requires a direct source disposition");
  }
  if (input.projectState === "closed")
    throw new Error("Closed project rejects direct project cost");
  return Object.freeze({
    organizationId: source.organizationId,
    id: `source:${source.id}`,
    projectId: required(input.projectId, "Project cost project ID"),
    sourceType: source.sourceType,
    sourceId: source.sourceId,
    ...(source.sourceLineId ? { sourceLineId: source.sourceLineId } : {}),
    ...(source.sourceAllocationId ? { sourceAllocationId: source.sourceAllocationId } : {}),
    costClass: source.costClass,
    basis: source.basis,
    effectiveOn: source.effectiveOn,
    currency: source.currency,
    amountMinor: source.amountMinor,
    baseAmountMinor: source.baseAmountMinor,
    ...(source.ledgerAccountCode ? { ledgerAccountCode: source.ledgerAccountCode } : {}),
    ...(source.journalId ? { journalId: source.journalId } : {}),
    ...(source.journalLineId ? { journalLineId: source.journalLineId } : {}),
    ...(source.timesheetId ? { timesheetId: source.timesheetId } : {}),
    ...(source.workerId ? { workerId: source.workerId } : {}),
    evidenceIds: source.evidenceIds,
  });
}

function allocationEvent(
  allocation: DirectCostAllocation | undefined,
  action: DirectCostAllocationEvent["action"],
  input: { actorId: string; occurredAt: string; reason: string },
): DirectCostAllocationEvent {
  return Object.freeze({
    sequence: (allocation?.events.length ?? 0) + 1,
    action,
    actorId: required(input.actorId, "Direct cost actor"),
    occurredAt: timestamp(input.occurredAt, "Direct cost event time"),
    reason: required(input.reason, "Direct cost reason"),
  });
}

export function createDirectCostAllocation(input: {
  organizationId: string;
  id: string;
  source: ProjectCostSource;
  splits: readonly DirectCostSplit[];
  actorId: string;
  occurredAt: string;
  reason: string;
}): DirectCostAllocation {
  const organizationId = required(input.organizationId, "Direct cost organization ID");
  const source = createProjectCostSource(input.source);
  if (source.organizationId !== organizationId)
    throw new Error("Direct cost source belongs to another organization");
  if (source.disposition === "overhead_reserved") {
    throw new Error("DIRECT_COST_SOURCE_RESERVED_FOR_OVERHEAD");
  }
  if (source.disposition === "direct") throw new Error("DIRECT_COST_SOURCE_ALREADY_DIRECT");
  if (source.remainingAmountMinor <= 0n || source.remainingBaseAmountMinor <= 0n) {
    throw new Error("Direct cost source has no remaining allocatable amount");
  }
  if (!input.splits.length) throw new Error("Direct cost allocation requires at least one split");
  const ids = new Set<string>();
  const projects = new Set<string>();
  const splits = input.splits.map((split) => {
    const id = required(split.id, "Direct cost split ID");
    const projectId = required(split.projectId, "Direct cost project ID");
    if (ids.has(id) || projects.has(projectId))
      throw new Error("Direct cost splits must be unique");
    ids.add(id);
    projects.add(projectId);
    if (split.projectState === "closed")
      throw new Error("Closed project rejects direct cost allocation");
    if (split.amountMinor <= 0n || split.baseAmountMinor <= 0n) {
      throw new Error("Direct cost split amounts must be positive");
    }
    return Object.freeze({ ...split, id, projectId });
  });
  const amount = splits.reduce((sum, split) => sum + split.amountMinor, 0n);
  const baseAmount = splits.reduce((sum, split) => sum + split.baseAmountMinor, 0n);
  if (amount !== source.remainingAmountMinor || baseAmount !== source.remainingBaseAmountMinor) {
    throw new Error("Direct cost splits must exactly allocate remaining source amounts");
  }
  const created = allocationEvent(undefined, "create", input);
  return Object.freeze({
    organizationId,
    id: required(input.id, "Direct cost allocation ID"),
    source,
    splits: Object.freeze(splits),
    state: "draft",
    version: 1,
    events: Object.freeze([created]),
  });
}

function transition(
  allocation: DirectCostAllocation,
  expected: DirectCostAllocationState,
  state: DirectCostAllocationState,
  action: DirectCostAllocationEvent["action"],
  input: { actorId: string; occurredAt: string; reason: string },
): DirectCostAllocation {
  if (allocation.state !== expected) {
    throw new Error(`Invalid direct cost transition: ${allocation.state} -> ${state}`);
  }
  const nextEvent = allocationEvent(allocation, action, input);
  return Object.freeze({
    ...allocation,
    state,
    version: allocation.version + 1,
    events: Object.freeze([...allocation.events, nextEvent]),
    ...(state === "submitted" ? { submittedBy: nextEvent.actorId } : {}),
    ...(state === "approved" ? { approvedBy: nextEvent.actorId } : {}),
  });
}

export const submitDirectCostAllocation = (
  allocation: DirectCostAllocation,
  input: { actorId: string; occurredAt: string; reason: string },
) => transition(allocation, "draft", "submitted", "submit", input);

export function approveDirectCostAllocation(
  allocation: DirectCostAllocation,
  input: { actorId: string; occurredAt: string; reason: string; allowSelfApproval?: boolean },
): DirectCostAllocation {
  if (!input.allowSelfApproval && allocation.submittedBy === input.actorId) {
    throw new Error("DIRECT_COST_MAKER_CHECKER_VIOLATION");
  }
  return transition(allocation, "submitted", "approved", "approve", input);
}

export function postDirectCostAllocation(
  allocation: DirectCostAllocation,
  input: { actorId: string; occurredAt: string; reason: string; journalId?: string },
): DirectCostAllocation {
  if (allocation.source.basis === "ledger" && !input.journalId?.trim()) {
    throw new Error("Ledger direct cost allocation requires a reclassification journal");
  }
  const posted = transition(allocation, "approved", "posted", "post", input);
  return Object.freeze({
    ...posted,
    ...(input.journalId?.trim() ? { journalId: input.journalId.trim() } : {}),
  });
}

export function reverseDirectCostAllocation(
  allocation: DirectCostAllocation,
  input: { actorId: string; occurredAt: string; reason: string; reversalJournalId?: string },
): DirectCostAllocation {
  if (allocation.journalId && !input.reversalJournalId?.trim()) {
    throw new Error("Posted journal allocation requires a reversal journal");
  }
  const reversed = transition(allocation, "posted", "reversed", "reverse", input);
  return Object.freeze({
    ...reversed,
    ...(input.reversalJournalId?.trim()
      ? { reversalJournalId: input.reversalJournalId.trim() }
      : {}),
  });
}

export function materializeDirectProjectCosts(
  allocation: DirectCostAllocation,
): readonly ProjectCostItem[] {
  if (allocation.state !== "posted")
    throw new Error("Only posted direct allocation creates project costs");
  return Object.freeze(
    allocation.splits.map((split) =>
      Object.freeze({
        organizationId: allocation.organizationId,
        id: `${allocation.id}:${split.id}`,
        projectId: split.projectId,
        sourceType: allocation.source.sourceType,
        sourceId: allocation.source.sourceId,
        ...(allocation.source.sourceLineId ? { sourceLineId: allocation.source.sourceLineId } : {}),
        ...(allocation.source.sourceAllocationId
          ? { sourceAllocationId: allocation.source.sourceAllocationId }
          : {}),
        directCostAllocationId: allocation.id,
        costClass: allocation.source.costClass,
        basis: allocation.source.basis,
        effectiveOn: allocation.source.effectiveOn,
        currency: allocation.source.currency,
        amountMinor: split.amountMinor,
        baseAmountMinor: split.baseAmountMinor,
        ...(allocation.source.ledgerAccountCode
          ? { ledgerAccountCode: allocation.source.ledgerAccountCode }
          : {}),
        ...((allocation.journalId ?? allocation.source.journalId)
          ? { journalId: allocation.journalId ?? allocation.source.journalId! }
          : {}),
        ...(allocation.source.journalLineId
          ? { journalLineId: allocation.source.journalLineId }
          : {}),
        ...(allocation.source.timesheetId ? { timesheetId: allocation.source.timesheetId } : {}),
        ...(allocation.source.workerId ? { workerId: allocation.source.workerId } : {}),
        evidenceIds: allocation.source.evidenceIds,
      }),
    ),
  );
}

export function assertSourceNotDirectAndOverhead(input: {
  directAllocatedMinor: bigint;
  overheadReservedMinor: bigint;
}): void {
  if (input.directAllocatedMinor < 0n || input.overheadReservedMinor < 0n) {
    throw new Error("Cost allocation control amounts cannot be negative");
  }
  if (input.directAllocatedMinor > 0n && input.overheadReservedMinor > 0n) {
    throw new Error("PROJECT_COST_DOUBLE_COUNT_DIRECT_AND_OVERHEAD");
  }
}
