export const TIMESHEET_STATES = [
  "draft",
  "submitted",
  "approved",
  "rejected",
  "locked",
  "billed",
] as const;
export type TimesheetState = (typeof TIMESHEET_STATES)[number];
export type TimeEntryMode = "timed" | "allocation";
export type WorkClassification = "project" | "internal";
export type BillingClassification = "billable" | "non_billable";
export type LaborCostBasis = "gross_salary" | "fully_loaded" | "blended";
export type LaborCostRateState = "draft" | "approved" | "retired";

export type WorkforceProfile = Readonly<{
  organizationId: string;
  id: string;
  workerPartyId: string;
  userId?: string;
  employmentKind: "employee" | "freelancer" | "contractor";
  startsOn: string;
  endsOn?: string;
  status: "active" | "inactive";
  version: number;
}>;

export type AppliedLaborCost = Readonly<{
  rateVersionId: string;
  rateMinorPerHour: bigint;
  currency: string;
  calculationVersion: 1;
  roundingPolicy: "half_up";
  costMinor: bigint;
}>;

export type TimeEntry = Readonly<{
  id: string;
  workDate: string;
  mode: TimeEntryMode;
  startsAt?: string;
  endsAt?: string;
  minutes: number;
  workClassification: WorkClassification;
  billingClassification: BillingClassification;
  projectId?: string;
  contractId?: string;
  serviceLineCode?: string;
  costCenterCode?: string;
  activityCode?: string;
  description: string;
  appliedCost?: AppliedLaborCost;
}>;

export type TimeAdjustment = Readonly<{
  id: string;
  originalEntryId: string;
  workDate: string;
  minutesDelta: number;
  reason: string;
  state: "draft" | "submitted" | "approved";
  createdBy: string;
  approvedBy?: string;
  appliedCost?: AppliedLaborCost;
}>;

export type TimesheetEvent = Readonly<{
  sequence: number;
  action: "create" | "submit" | "approve" | "reject" | "revise" | "lock" | "bill";
  actorId: string;
  occurredAt: string;
  reason: string;
}>;

export type Timesheet = Readonly<{
  organizationId: string;
  id: string;
  workerId: string;
  weekStartsOn: string;
  state: TimesheetState;
  entries: readonly TimeEntry[];
  adjustments: readonly TimeAdjustment[];
  version: number;
  events: readonly TimesheetEvent[];
  submittedBy?: string;
  approvedBy?: string;
  rejectedBy?: string;
  lockedBy?: string;
  billingReference?: string;
}>;

export type LaborCostRateVersion = Readonly<{
  organizationId: string;
  id: string;
  workerId: string;
  basis: LaborCostBasis;
  currency: string;
  rateMinorPerHour: bigint;
  effectiveFrom: string;
  effectiveTo?: string;
  state: LaborCostRateState;
  version: number;
  approvedBy?: string;
  approvedAt?: string;
}>;

export type WorkerCapacityVersion = Readonly<{
  organizationId: string;
  id: string;
  workerId: string;
  effectiveFrom: string;
  effectiveTo?: string;
  weeklyCapacityMinutes: number;
  workdays: readonly number[];
  version: number;
}>;

export type TimeCapacitySummary = Readonly<{
  workerId: string;
  startsOn: string;
  endsOn: string;
  availableMinutes: number;
  approvedMinutes: number;
  billableMinutes: number;
  nonBillableMinutes: number;
  unallocatedMinutes: number;
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
  if (!/^[A-Z]{3}$/.test(normalized)) throw new Error("Labor cost currency must be ISO-4217");
  return normalized;
}

function assertEffectiveRange(from: string, to?: string): void {
  isoDate(from, "Effective-from");
  if (to && isoDate(to, "Effective-to") < from) {
    throw new Error("Effective-to cannot precede effective-from");
  }
}

export function createWorkforceProfile(input: {
  organizationId: string;
  id: string;
  workerPartyId: string;
  userId?: string;
  employmentKind: WorkforceProfile["employmentKind"];
  startsOn: string;
  endsOn?: string;
}): WorkforceProfile {
  assertEffectiveRange(input.startsOn, input.endsOn);
  return Object.freeze({
    organizationId: required(input.organizationId, "Workforce organization ID"),
    id: required(input.id, "Workforce profile ID"),
    workerPartyId: required(input.workerPartyId, "Worker party ID"),
    ...(input.userId?.trim() ? { userId: input.userId.trim() } : {}),
    employmentKind: input.employmentKind,
    startsOn: input.startsOn,
    ...(input.endsOn ? { endsOn: input.endsOn } : {}),
    status: "active",
    version: 1,
  });
}

export function deactivateWorkforceProfile(profile: WorkforceProfile): WorkforceProfile {
  if (profile.status === "inactive") return profile;
  return Object.freeze({ ...profile, status: "inactive", version: profile.version + 1 });
}

function checkedEntry(entry: TimeEntry, weekStartsOn: string): TimeEntry {
  const workDate = isoDate(entry.workDate, "Time entry work date");
  const weekEnd = new Date(`${weekStartsOn}T00:00:00Z`);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  if (workDate < weekStartsOn || workDate > weekEnd.toISOString().slice(0, 10)) {
    throw new Error("Time entry must fall within its timesheet week");
  }
  if (!Number.isInteger(entry.minutes) || entry.minutes <= 0 || entry.minutes > 1_440) {
    throw new Error("Time entry minutes must be an integer from 1 to 1440");
  }
  if (entry.mode === "timed") {
    if (!entry.startsAt || !entry.endsAt) throw new Error("Timed entry requires start and end");
    const startsAt = timestamp(entry.startsAt, "Time entry start");
    const endsAt = timestamp(entry.endsAt, "Time entry end");
    const calculated = (Date.parse(endsAt) - Date.parse(startsAt)) / 60_000;
    if (calculated <= 0 || calculated !== entry.minutes) {
      throw new Error("Timed entry duration must equal exact entry minutes");
    }
    if (!startsAt.startsWith(workDate) || !endsAt.startsWith(workDate)) {
      throw new Error("Timed entry cannot cross its work date");
    }
  } else if (entry.startsAt || entry.endsAt) {
    throw new Error("Allocation entry cannot contain clock timestamps");
  }
  if (entry.workClassification === "project") {
    if (!entry.projectId?.trim()) throw new Error("Project time requires a project");
  } else if (entry.projectId) {
    throw new Error("Internal time cannot carry a project");
  }
  if (entry.billingClassification === "billable" && entry.workClassification !== "project") {
    throw new Error("Only project time can be billable");
  }
  return Object.freeze({ ...entry, description: required(entry.description, "Time description") });
}

export function assertNoTimeOverlap(entries: readonly TimeEntry[]): void {
  const byDate = new Map<string, TimeEntry[]>();
  for (const entry of entries)
    byDate.set(entry.workDate, [...(byDate.get(entry.workDate) ?? []), entry]);
  for (const daily of byDate.values()) {
    if (
      daily.some((entry) => entry.mode === "timed") &&
      daily.some((entry) => entry.mode === "allocation")
    ) {
      throw new Error("Timed and allocation entries cannot be mixed on the same day");
    }
    if (daily.reduce((sum, entry) => sum + entry.minutes, 0) > 1_440) {
      throw new Error("Daily time cannot exceed 1440 minutes");
    }
    const timed = daily
      .filter((entry) => entry.mode === "timed")
      .sort((left, right) => left.startsAt!.localeCompare(right.startsAt!));
    for (let index = 1; index < timed.length; index += 1) {
      if (Date.parse(timed[index]!.startsAt!) < Date.parse(timed[index - 1]!.endsAt!)) {
        throw new Error("Worker time entries cannot overlap");
      }
    }
  }
}

function timesheetEvent(
  sheet: Timesheet | undefined,
  action: TimesheetEvent["action"],
  input: { actorId: string; occurredAt: string; reason: string },
): TimesheetEvent {
  return Object.freeze({
    sequence: (sheet?.events.length ?? 0) + 1,
    action,
    actorId: required(input.actorId, "Timesheet actor"),
    occurredAt: timestamp(input.occurredAt, "Timesheet event time"),
    reason: required(input.reason, "Timesheet reason"),
  });
}

export function createTimesheet(input: {
  organizationId: string;
  id: string;
  workerId: string;
  weekStartsOn: string;
  entries: readonly TimeEntry[];
  actorId: string;
  occurredAt: string;
  reason: string;
}): Timesheet {
  const weekStartsOn = isoDate(input.weekStartsOn, "Timesheet week start");
  if (!input.entries.length) throw new Error("Timesheet requires at least one entry");
  const ids = new Set<string>();
  const entries = input.entries.map((entry) => {
    if (ids.has(entry.id)) throw new Error("Time entry IDs must be unique");
    ids.add(required(entry.id, "Time entry ID"));
    return checkedEntry(entry, weekStartsOn);
  });
  assertNoTimeOverlap(entries);
  const created = timesheetEvent(undefined, "create", input);
  return Object.freeze({
    organizationId: required(input.organizationId, "Timesheet organization ID"),
    id: required(input.id, "Timesheet ID"),
    workerId: required(input.workerId, "Timesheet worker ID"),
    weekStartsOn,
    state: "draft",
    entries: Object.freeze(entries),
    adjustments: Object.freeze([]),
    version: 1,
    events: Object.freeze([created]),
  });
}

function transition(
  sheet: Timesheet,
  from: readonly TimesheetState[],
  state: TimesheetState,
  action: TimesheetEvent["action"],
  input: { actorId: string; occurredAt: string; reason: string },
): Timesheet {
  if (!from.includes(sheet.state))
    throw new Error(`Invalid timesheet transition: ${sheet.state} -> ${state}`);
  const nextEvent = timesheetEvent(sheet, action, input);
  return Object.freeze({
    ...sheet,
    state,
    version: sheet.version + 1,
    events: Object.freeze([...sheet.events, nextEvent]),
    ...(state === "submitted" ? { submittedBy: nextEvent.actorId } : {}),
    ...(state === "rejected" ? { rejectedBy: nextEvent.actorId } : {}),
    ...(state === "locked" ? { lockedBy: nextEvent.actorId } : {}),
  });
}

export const submitTimesheet = (
  sheet: Timesheet,
  input: { actorId: string; occurredAt: string; reason: string },
) => transition(sheet, ["draft"], "submitted", "submit", input);

export const rejectTimesheet = (
  sheet: Timesheet,
  input: { actorId: string; occurredAt: string; reason: string },
) => transition(sheet, ["submitted"], "rejected", "reject", input);

export const reviseRejectedTimesheet = (
  sheet: Timesheet,
  input: { actorId: string; occurredAt: string; reason: string },
) => transition(sheet, ["rejected"], "draft", "revise", input);

export function createLaborCostRate(input: {
  organizationId: string;
  id: string;
  workerId: string;
  basis: LaborCostBasis;
  currency: string;
  rateMinorPerHour: bigint;
  effectiveFrom: string;
  effectiveTo?: string;
}): LaborCostRateVersion {
  assertEffectiveRange(input.effectiveFrom, input.effectiveTo);
  if (input.rateMinorPerHour <= 0n) throw new Error("Labor cost rate must be positive");
  return Object.freeze({
    organizationId: required(input.organizationId, "Cost rate organization ID"),
    id: required(input.id, "Cost rate ID"),
    workerId: required(input.workerId, "Cost rate worker ID"),
    basis: input.basis,
    currency: currency(input.currency),
    rateMinorPerHour: input.rateMinorPerHour,
    effectiveFrom: input.effectiveFrom,
    ...(input.effectiveTo ? { effectiveTo: input.effectiveTo } : {}),
    state: "draft",
    version: 1,
  });
}

function overlaps(left: LaborCostRateVersion, right: LaborCostRateVersion): boolean {
  return (
    (left.effectiveTo ?? "9999-12-31") >= right.effectiveFrom &&
    (right.effectiveTo ?? "9999-12-31") >= left.effectiveFrom
  );
}

export function assertNonOverlappingCostRates(rates: readonly LaborCostRateVersion[]): void {
  const approved = rates.filter((rate) => rate.state === "approved");
  for (let left = 0; left < approved.length; left += 1) {
    for (let right = left + 1; right < approved.length; right += 1) {
      const a = approved[left]!;
      const b = approved[right]!;
      if (a.organizationId === b.organizationId && a.workerId === b.workerId && overlaps(a, b)) {
        throw new Error("Approved labor cost rate ranges cannot overlap");
      }
    }
  }
}

export function approveLaborCostRate(
  rate: LaborCostRateVersion,
  existing: readonly LaborCostRateVersion[],
  input: { actorId: string; approvedAt: string },
): LaborCostRateVersion {
  if (rate.state !== "draft") throw new Error("Only draft labor cost rate can be approved");
  const approved = Object.freeze({
    ...rate,
    state: "approved" as const,
    version: rate.version + 1,
    approvedBy: required(input.actorId, "Cost rate approver"),
    approvedAt: timestamp(input.approvedAt, "Cost rate approval time"),
  });
  assertNonOverlappingCostRates([...existing, approved]);
  return approved;
}

export function retireLaborCostRate(rate: LaborCostRateVersion): LaborCostRateVersion {
  if (rate.state !== "approved") throw new Error("Only approved labor cost rate can be retired");
  return Object.freeze({ ...rate, state: "retired", version: rate.version + 1 });
}

export function resolveEffectiveCostRate(
  rates: readonly LaborCostRateVersion[],
  organizationId: string,
  workerId: string,
  workDateInput: string,
): LaborCostRateVersion {
  const workDate = isoDate(workDateInput, "Labor cost work date");
  const matches = rates.filter(
    (rate) =>
      rate.organizationId === organizationId &&
      rate.workerId === workerId &&
      rate.state === "approved" &&
      rate.effectiveFrom <= workDate &&
      (rate.effectiveTo ?? "9999-12-31") >= workDate,
  );
  if (matches.length !== 1)
    throw new Error(matches.length ? "LABOR_COST_RATE_AMBIGUOUS" : "LABOR_COST_RATE_NOT_FOUND");
  return matches[0]!;
}

export function calculateAppliedLaborCost(
  minutes: number,
  rate: LaborCostRateVersion,
): AppliedLaborCost {
  if (!Number.isInteger(minutes) || minutes === 0)
    throw new Error("Labor cost minutes must be a non-zero integer");
  const numerator = BigInt(minutes) * rate.rateMinorPerHour;
  const absolute = numerator < 0n ? -numerator : numerator;
  const rounded = (absolute + 30n) / 60n;
  return Object.freeze({
    rateVersionId: rate.id,
    rateMinorPerHour: rate.rateMinorPerHour,
    currency: rate.currency,
    calculationVersion: 1,
    roundingPolicy: "half_up",
    costMinor: numerator < 0n ? -rounded : rounded,
  });
}

export function approveTimesheet(
  sheet: Timesheet,
  rates: readonly LaborCostRateVersion[],
  input: { actorId: string; occurredAt: string; reason: string; allowSelfApproval?: boolean },
): Timesheet {
  if (sheet.state !== "submitted") throw new Error("Only submitted timesheet can be approved");
  if (!input.allowSelfApproval && sheet.submittedBy === input.actorId) {
    throw new Error("TIMESHEET_MAKER_CHECKER_VIOLATION");
  }
  const entries = sheet.entries.map((entry) => {
    const rate = resolveEffectiveCostRate(
      rates,
      sheet.organizationId,
      sheet.workerId,
      entry.workDate,
    );
    return Object.freeze({ ...entry, appliedCost: calculateAppliedLaborCost(entry.minutes, rate) });
  });
  const approved = timesheetEvent(sheet, "approve", input);
  return Object.freeze({
    ...sheet,
    state: "approved",
    entries: Object.freeze(entries),
    version: sheet.version + 1,
    events: Object.freeze([...sheet.events, approved]),
    approvedBy: approved.actorId,
  });
}

export const lockTimesheet = (
  sheet: Timesheet,
  input: { actorId: string; occurredAt: string; reason: string },
) => transition(sheet, ["approved"], "locked", "lock", input);

export function markTimesheetBilled(
  sheet: Timesheet,
  input: { actorId: string; occurredAt: string; reason: string; billingReference: string },
): Timesheet {
  if (!sheet.entries.some((entry) => entry.billingClassification === "billable")) {
    throw new Error("Timesheet without billable time cannot be billed");
  }
  const billed = transition(sheet, ["approved", "locked"], "billed", "bill", input);
  return Object.freeze({
    ...billed,
    billingReference: required(input.billingReference, "Timesheet billing reference"),
  });
}

export function createTimeAdjustment(
  sheet: Timesheet,
  input: Omit<TimeAdjustment, "state" | "approvedBy" | "appliedCost">,
): Timesheet {
  if (!["approved", "locked", "billed"].includes(sheet.state)) {
    throw new Error("Adjustments require an approved, locked or billed timesheet");
  }
  if (!Number.isInteger(input.minutesDelta) || input.minutesDelta === 0) {
    throw new Error("Adjustment minutes delta must be a non-zero integer");
  }
  const original = sheet.entries.find((entry) => entry.id === input.originalEntryId);
  if (!original) throw new Error("Adjustment original entry not found");
  if (input.workDate !== original.workDate) {
    throw new Error("Adjustment work date must match its original entry");
  }
  const prior = sheet.adjustments
    .filter(
      (adjustment) => adjustment.originalEntryId === original.id && adjustment.state === "approved",
    )
    .reduce((sum, adjustment) => sum + adjustment.minutesDelta, 0);
  if (original.minutes + prior + input.minutesDelta < 0) {
    throw new Error("Adjustment cannot make effective time negative");
  }
  if (sheet.adjustments.some((adjustment) => adjustment.id === input.id)) {
    throw new Error("Adjustment ID already exists");
  }
  const adjustment: TimeAdjustment = Object.freeze({
    ...input,
    id: required(input.id, "Adjustment ID"),
    workDate: isoDate(input.workDate, "Adjustment work date"),
    reason: required(input.reason, "Adjustment reason"),
    createdBy: required(input.createdBy, "Adjustment creator"),
    state: "draft",
  });
  return Object.freeze({
    ...sheet,
    version: sheet.version + 1,
    adjustments: Object.freeze([...sheet.adjustments, adjustment]),
  });
}

export function approveTimeAdjustment(
  sheet: Timesheet,
  adjustmentId: string,
  rates: readonly LaborCostRateVersion[],
  approverId: string,
): Timesheet {
  const adjustment = sheet.adjustments.find((candidate) => candidate.id === adjustmentId);
  if (!adjustment) throw new Error("Adjustment not found");
  if (adjustment.state !== "submitted")
    throw new Error("Only submitted adjustment can be approved");
  if (adjustment.createdBy === approverId) throw new Error("TIMESHEET_MAKER_CHECKER_VIOLATION");
  const rate = resolveEffectiveCostRate(
    rates,
    sheet.organizationId,
    sheet.workerId,
    adjustment.workDate,
  );
  return Object.freeze({
    ...sheet,
    version: sheet.version + 1,
    adjustments: Object.freeze(
      sheet.adjustments.map((candidate) =>
        candidate.id === adjustmentId
          ? Object.freeze({
              ...candidate,
              state: "approved" as const,
              approvedBy: approverId,
              appliedCost: calculateAppliedLaborCost(candidate.minutesDelta, rate),
            })
          : candidate,
      ),
    ),
  });
}

export function submitTimeAdjustment(sheet: Timesheet, adjustmentId: string): Timesheet {
  const adjustment = sheet.adjustments.find((candidate) => candidate.id === adjustmentId);
  if (!adjustment) throw new Error("Adjustment not found");
  if (adjustment.state !== "draft") throw new Error("Only draft adjustment can be submitted");
  return Object.freeze({
    ...sheet,
    version: sheet.version + 1,
    adjustments: Object.freeze(
      sheet.adjustments.map((candidate) =>
        candidate.id === adjustmentId
          ? Object.freeze({ ...candidate, state: "submitted" as const })
          : candidate,
      ),
    ),
  });
}

export function createWorkerCapacityVersion(input: {
  organizationId: string;
  id: string;
  workerId: string;
  effectiveFrom: string;
  effectiveTo?: string;
  weeklyCapacityMinutes: number;
  workdays: readonly number[];
}): WorkerCapacityVersion {
  assertEffectiveRange(input.effectiveFrom, input.effectiveTo);
  if (!Number.isInteger(input.weeklyCapacityMinutes) || input.weeklyCapacityMinutes <= 0) {
    throw new Error("Weekly capacity must be a positive integer");
  }
  const workdays = [...new Set(input.workdays)].sort();
  if (!workdays.length || workdays.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) {
    throw new Error("Capacity workdays must use ISO weekdays 1 to 7");
  }
  return Object.freeze({
    organizationId: required(input.organizationId, "Capacity organization ID"),
    id: required(input.id, "Capacity ID"),
    workerId: required(input.workerId, "Capacity worker ID"),
    effectiveFrom: input.effectiveFrom,
    ...(input.effectiveTo ? { effectiveTo: input.effectiveTo } : {}),
    weeklyCapacityMinutes: input.weeklyCapacityMinutes,
    workdays: Object.freeze(workdays),
    version: 1,
  });
}

export function resolveWorkerCapacity(
  versions: readonly WorkerCapacityVersion[],
  organizationId: string,
  workerId: string,
  dateInput: string,
): WorkerCapacityVersion {
  const date = isoDate(dateInput, "Capacity date");
  const matches = versions.filter(
    (version) =>
      version.organizationId === organizationId &&
      version.workerId === workerId &&
      version.effectiveFrom <= date &&
      (version.effectiveTo ?? "9999-12-31") >= date,
  );
  if (matches.length !== 1)
    throw new Error(matches.length ? "WORKER_CAPACITY_AMBIGUOUS" : "WORKER_CAPACITY_NOT_FOUND");
  return matches[0]!;
}

export function buildTimeCapacitySummary(input: {
  workerId: string;
  startsOn: string;
  endsOn: string;
  capacityMinutes: number;
  timesheets: readonly Timesheet[];
}): TimeCapacitySummary {
  const startsOn = isoDate(input.startsOn, "Capacity summary start");
  const endsOn = isoDate(input.endsOn, "Capacity summary end");
  if (endsOn < startsOn) throw new Error("Capacity summary end cannot precede start");
  if (!Number.isInteger(input.capacityMinutes) || input.capacityMinutes < 0) {
    throw new Error("Capacity summary minutes must be non-negative");
  }
  const entries = input.timesheets
    .filter(
      (sheet) =>
        sheet.workerId === input.workerId && ["approved", "locked", "billed"].includes(sheet.state),
    )
    .flatMap((sheet) => sheet.entries)
    .filter((entry) => entry.workDate >= startsOn && entry.workDate <= endsOn);
  const approvedMinutes = entries.reduce((sum, entry) => sum + entry.minutes, 0);
  const approvedAdjustments = input.timesheets
    .filter(
      (sheet) =>
        sheet.workerId === input.workerId && ["approved", "locked", "billed"].includes(sheet.state),
    )
    .flatMap((sheet) =>
      sheet.adjustments
        .filter(
          (adjustment) =>
            adjustment.state === "approved" &&
            adjustment.workDate >= startsOn &&
            adjustment.workDate <= endsOn,
        )
        .map((adjustment) => ({
          minutesDelta: adjustment.minutesDelta,
          billingClassification: sheet.entries.find(
            (entry) => entry.id === adjustment.originalEntryId,
          )!.billingClassification,
        })),
    );
  const adjustmentMinutes = approvedAdjustments.reduce(
    (sum, adjustment) => sum + adjustment.minutesDelta,
    0,
  );
  const effectiveApprovedMinutes = approvedMinutes + adjustmentMinutes;
  const billableMinutes =
    entries
      .filter((entry) => entry.billingClassification === "billable")
      .reduce((sum, entry) => sum + entry.minutes, 0) +
    approvedAdjustments
      .filter((adjustment) => adjustment.billingClassification === "billable")
      .reduce((sum, adjustment) => sum + adjustment.minutesDelta, 0);
  return Object.freeze({
    workerId: required(input.workerId, "Capacity summary worker"),
    startsOn,
    endsOn,
    availableMinutes: input.capacityMinutes,
    approvedMinutes: effectiveApprovedMinutes,
    billableMinutes,
    nonBillableMinutes: effectiveApprovedMinutes - billableMinutes,
    unallocatedMinutes: Math.max(0, input.capacityMinutes - effectiveApprovedMinutes),
  });
}
