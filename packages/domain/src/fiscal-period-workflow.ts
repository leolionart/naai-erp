import type { Role } from "./authorization.js";
import type { FiscalPeriod, FiscalPeriodState } from "./organization-setup.js";
import { organizationId } from "./organization.js";

export type FiscalPeriodEventAction = "soft_locked" | "hard_locked" | "reopened";

export type FiscalPeriodEvent = Readonly<{
  action: FiscalPeriodEventAction;
  previousState: FiscalPeriodState;
  actorId: string;
  occurredAt: string;
  reason: string;
  approverId?: string;
  reconciliationRequired: boolean;
}>;

export type FiscalPeriodWorkflow = Readonly<{
  period: FiscalPeriod;
  events: readonly FiscalPeriodEvent[];
}>;

export type ReopenPolicy = Readonly<{
  requireDistinctApprover: boolean;
}>;

function required(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function isoDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error("Posting date must be an ISO date");
  }
  return value;
}

function timestamp(value: string): string {
  if (Number.isNaN(Date.parse(value))) throw new Error("Period event timestamp must be valid");
  return value;
}

function immutableWorkflow(workflow: FiscalPeriodWorkflow): FiscalPeriodWorkflow {
  return Object.freeze({
    period: Object.freeze({ ...workflow.period }),
    events: Object.freeze(workflow.events.map((event) => Object.freeze({ ...event }))),
  });
}

export function createFiscalPeriodWorkflow(period: FiscalPeriod): FiscalPeriodWorkflow {
  if (period.endsOn < period.startsOn) throw new Error("Fiscal period end cannot precede start");
  return immutableWorkflow({ period, events: [] });
}

export function lockFiscalPeriod(
  workflow: FiscalPeriodWorkflow,
  input: {
    targetState: "soft_locked" | "hard_locked";
    actorId: string;
    approvedBy: string;
    occurredAt: string;
    reason: string;
  },
): FiscalPeriodWorkflow {
  const allowed =
    (workflow.period.state === "open" && input.targetState === "soft_locked") ||
    (workflow.period.state === "soft_locked" && input.targetState === "hard_locked");
  if (!allowed) {
    throw new Error(
      `Invalid fiscal period lock transition: ${workflow.period.state} -> ${input.targetState}`,
    );
  }
  const actorId = required(input.actorId, "Period lock actor");
  const approvedBy = required(input.approvedBy, "Period lock approver");
  return immutableWorkflow({
    period: { ...workflow.period, state: input.targetState },
    events: [
      ...workflow.events,
      {
        action: input.targetState,
        previousState: workflow.period.state,
        actorId,
        approverId: approvedBy,
        occurredAt: timestamp(input.occurredAt),
        reason: required(input.reason, "Period lock reason"),
        reconciliationRequired: input.targetState === "hard_locked",
      },
    ],
  });
}

export function reopenFiscalPeriod(
  workflow: FiscalPeriodWorkflow,
  input: {
    requestedBy: string;
    approvedBy: string;
    occurredAt: string;
    reason: string;
    hasElevatedPermission: boolean;
    policy: ReopenPolicy;
  },
): FiscalPeriodWorkflow {
  if (workflow.period.state === "open") throw new Error("Open fiscal period cannot be reopened");
  if (!input.hasElevatedPermission) throw new Error("Elevated permission is required to reopen");
  const requestedBy = required(input.requestedBy, "Reopen requester");
  const approvedBy = required(input.approvedBy, "Reopen approver");
  if (input.policy.requireDistinctApprover && requestedBy === approvedBy) {
    throw new Error("Reopen policy requires a distinct approver");
  }
  return immutableWorkflow({
    period: { ...workflow.period, state: "open" },
    events: [
      ...workflow.events,
      {
        action: "reopened",
        previousState: workflow.period.state,
        actorId: requestedBy,
        approverId: approvedBy,
        occurredAt: timestamp(input.occurredAt),
        reason: required(input.reason, "Reopen reason"),
        reconciliationRequired: true,
      },
    ],
  });
}

export function findFiscalPeriod(
  periods: readonly FiscalPeriod[],
  input: { organizationId: string; date: string },
): FiscalPeriod {
  const orgId = organizationId(input.organizationId);
  const targetDate = isoDate(input.date);
  const matches = periods.filter(
    (period) =>
      period.organizationId === orgId &&
      period.startsOn <= targetDate &&
      period.endsOn >= targetDate,
  );
  if (!matches.length) throw new Error(`No fiscal period contains ${targetDate}`);
  if (matches.length > 1) throw new Error(`Multiple fiscal periods contain ${targetDate}`);
  return matches[0]!;
}

export function assertPostingAllowed(input: {
  periods: readonly FiscalPeriod[];
  organizationId: string;
  postingDate: string;
  actorRoles: readonly Role[];
  softLockPostingRoles: readonly Role[];
  hasElevatedPermission?: boolean;
}): FiscalPeriod {
  const period = findFiscalPeriod(input.periods, {
    organizationId: input.organizationId,
    date: input.postingDate,
  });
  if (period.state === "hard_locked") {
    throw new Error("Hard-locked fiscal period rejects posting and backdating");
  }
  if (period.state === "soft_locked") {
    const allowedRole = input.actorRoles.some((role) => input.softLockPostingRoles.includes(role));
    if (!allowedRole && !input.hasElevatedPermission) {
      throw new Error("Soft-locked fiscal period requires an allowed finance role");
    }
  }
  return period;
}

export function assertPaymentSettlementAllowed(input: {
  periods: readonly FiscalPeriod[];
  organizationId: string;
  settlementDate: string;
  originalJournalDate: string;
}): Readonly<{ settlementPeriod: FiscalPeriod; originalPeriod: FiscalPeriod }> {
  const settlementPeriod = findFiscalPeriod(input.periods, {
    organizationId: input.organizationId,
    date: input.settlementDate,
  });
  if (settlementPeriod.state !== "open") {
    throw new Error("Payment settlement must post in an open fiscal period");
  }
  const originalPeriod = findFiscalPeriod(input.periods, {
    organizationId: input.organizationId,
    date: input.originalJournalDate,
  });
  return Object.freeze({ settlementPeriod, originalPeriod });
}
