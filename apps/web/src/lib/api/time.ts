import type {
  CreateLaborCostRateRequest,
  CreateTimeAdjustmentRequest,
  CreateTimesheetRequest,
  LaborCostRateContract,
  LaborCostRateTransitionRequest,
  MarkTimesheetBilledRequest,
  TimeCapacitySummaryContract,
  TimesheetContract,
  TimesheetTransitionRequest,
  TimeAdjustmentTransitionRequest,
  WorkforceProfileContract,
} from "@naai-erp/contracts";

export type TimeWorker = WorkforceProfileContract;
export type Timesheet = TimesheetContract;
export type CreateTimesheetBody = CreateTimesheetRequest;
export type TimesheetTransitionBody = TimesheetTransitionRequest;
export type MarkTimesheetBilledBody = MarkTimesheetBilledRequest;
export type CreateTimeAdjustmentBody = CreateTimeAdjustmentRequest;
export type TimeAdjustmentTransitionBody = TimeAdjustmentTransitionRequest;
export type CostRate = LaborCostRateContract;
export type CreateCostRateBody = CreateLaborCostRateRequest;
export type CostRateTransitionBody = LaborCostRateTransitionRequest;
export type CapacitySummary = TimeCapacitySummaryContract;

const timesheet = (id: string) => `time/timesheets/${encodeURIComponent(id)}`;
export const timeApi = Object.freeze({
  workers: "time/workers",
  timesheets: "time/timesheets",
  timesheet,
  timesheetAction(id: string, action: string) {
    return `${timesheet(id)}/${action}`;
  },
  adjustments(id: string) {
    return `${timesheet(id)}/adjustments`;
  },
  adjustmentAction(id: string, adjustmentId: string, action: "submit" | "approve" | "reject") {
    return `${timesheet(id)}/adjustments/${encodeURIComponent(adjustmentId)}/${action}`;
  },
  costRates: "time/cost-rates",
  costRateAction(id: string, action: "approve" | "retire") {
    return `time/cost-rates/${encodeURIComponent(id)}/${action}`;
  },
  capacitySummary(query: { from: string; to: string; workerId?: string }) {
    const params = new URLSearchParams({ from: query.from, to: query.to });
    if (query.workerId) params.set("workerId", query.workerId);
    return `time/capacity-summary?${params}`;
  },
});
