import type { MutationMetadata } from "./index.js";

export const TIME_CONTRACT_VERSION = 1 as const;

export type WorkforceProfileContract = Readonly<{
  id: string;
  workerPartyId: string;
  userId?: string;
  employmentKind: "employee" | "freelancer" | "contractor";
  startsOn: string;
  endsOn?: string;
  status: "active" | "inactive";
  resourceVersion: string;
  nextActions: readonly string[];
}>;

export type CreateWorkforceProfileRequest = Readonly<{
  schemaVersion: typeof TIME_CONTRACT_VERSION;
  id?: string;
  workerPartyId: string;
  userId?: string;
  employmentKind: WorkforceProfileContract["employmentKind"];
  startsOn: string;
  endsOn?: string;
}>;

export type AppliedLaborCostContract = Readonly<{
  rateVersionId: string;
  currency: string;
  calculationVersion: 1;
  roundingPolicy: "half_up";
  costMinor: string;
}>;

export type TimeEntryContract = Readonly<{
  id: string;
  workDate: string;
  mode: "timed" | "allocation";
  startsAt?: string;
  endsAt?: string;
  minutes: number;
  workClassification: "project" | "internal";
  billingClassification: "billable" | "non_billable";
  projectId?: string;
  contractId?: string;
  serviceLineCode?: string;
  costCenterCode?: string;
  activityCode?: string;
  description: string;
  appliedCost?: AppliedLaborCostContract;
}>;

export type TimeEntryInputContract = Omit<TimeEntryContract, "appliedCost">;

export type TimeAdjustmentContract = Readonly<{
  id: string;
  originalEntryId: string;
  workDate: string;
  minutesDelta: number;
  reason: string;
  state: "draft" | "submitted" | "approved";
  createdBy: string;
  approvedBy?: string;
  appliedCost?: AppliedLaborCostContract;
}>;

export type TimesheetContract = Readonly<{
  id: string;
  workerId: string;
  weekStartsOn: string;
  state: "draft" | "submitted" | "approved" | "rejected" | "locked" | "billed";
  entries: readonly TimeEntryContract[];
  adjustments: readonly TimeAdjustmentContract[];
  submittedBy?: string;
  approvedBy?: string;
  rejectedBy?: string;
  lockedBy?: string;
  billingReference?: string;
  resourceVersion: string;
  nextActions: readonly string[];
}>;

export type CreateTimesheetRequest = Readonly<{
  schemaVersion: typeof TIME_CONTRACT_VERSION;
  id?: string;
  workerId: string;
  weekStartsOn: string;
  entries: readonly TimeEntryInputContract[];
  reason: string;
}>;

export type TimesheetTransitionRequest = Readonly<{
  schemaVersion: typeof TIME_CONTRACT_VERSION;
  expectedResourceVersion: string;
  reason: string;
}>;

export type MarkTimesheetBilledRequest = TimesheetTransitionRequest &
  Readonly<{ billingReference: string }>;

export type CreateTimeAdjustmentRequest = Readonly<{
  schemaVersion: typeof TIME_CONTRACT_VERSION;
  id?: string;
  originalEntryId: string;
  workDate: string;
  minutesDelta: number;
  reason: string;
  expectedResourceVersion: string;
}>;

export type TimeAdjustmentTransitionRequest = TimesheetTransitionRequest;

export type LaborCostRateContract = Readonly<{
  id: string;
  workerId: string;
  basis: "gross_salary" | "fully_loaded" | "blended";
  currency: string;
  rateMinorPerHour: string;
  effectiveFrom: string;
  effectiveTo?: string;
  state: "draft" | "approved" | "retired";
  resourceVersion: string;
  nextActions: readonly string[];
}>;

export type CreateLaborCostRateRequest = Readonly<{
  schemaVersion: typeof TIME_CONTRACT_VERSION;
  id?: string;
  workerId: string;
  basis: LaborCostRateContract["basis"];
  currency: string;
  rateMinorPerHour: string;
  effectiveFrom: string;
  effectiveTo?: string;
  reason: string;
}>;

export type LaborCostRateTransitionRequest = TimesheetTransitionRequest;

export type WorkerCapacityVersionContract = Readonly<{
  id: string;
  workerId: string;
  effectiveFrom: string;
  effectiveTo?: string;
  weeklyCapacityMinutes: number;
  workdays: readonly number[];
  resourceVersion: string;
  nextActions: readonly string[];
}>;

export type CreateWorkerCapacityVersionRequest = Readonly<{
  schemaVersion: typeof TIME_CONTRACT_VERSION;
  id?: string;
  workerId: string;
  effectiveFrom: string;
  effectiveTo?: string;
  weeklyCapacityMinutes: number;
  workdays: readonly number[];
  reason: string;
}>;

export type TimeCapacitySummaryContract = Readonly<{
  workerId: string;
  startsOn: string;
  endsOn: string;
  availableMinutes: number;
  approvedMinutes: number;
  billableMinutes: number;
  nonBillableMinutes: number;
  unallocatedMinutes: number;
}>;

export type TimeMutationResult<T> = Readonly<{
  resource: T;
  mutation: MutationMetadata;
}>;
