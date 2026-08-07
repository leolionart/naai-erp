import type {
  MilestoneAcceptanceContract,
  ProjectBudgetVersionContract,
  ProjectRevenueAxesContract,
  RevenueRecognitionEventContract,
  ScopeChangeContract,
} from "@naai-erp/contracts";
export type BudgetVersion = ProjectBudgetVersionContract;
export type ScopeChange = ScopeChangeContract;
export type MilestoneAcceptance = MilestoneAcceptanceContract;
export type RecognitionEvent = RevenueRecognitionEventContract;
export type RevenueAxes = ProjectRevenueAxesContract;
const p = (s: string) => encodeURIComponent(s);
export const projectRevenueApi = Object.freeze({
  budgets: (id: string) => `project-budgets?projectId=${p(id)}`,
  budget: (_projectId: string, id: string) => `project-budgets/${p(id)}`,
  scopeChanges: "scope-changes",
  scopeChange: (id: string) => `scope-changes/${p(id)}`,
  acceptances: "milestone-acceptances",
  acceptance: (id: string) => `milestone-acceptances/${p(id)}`,
  events: "revenue-recognition-events",
  event: (id: string) => `revenue-recognition-events/${p(id)}`,
  axes: (projectId: string, asOf: string) =>
    `project-revenue-position/${p(projectId)}?asOf=${p(asOf)}`,
  action: (path: string, action: string) => `${path}/${action}`,
});
