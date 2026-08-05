import type {
  CreateDirectCostAllocationRequest,
  DirectCostAllocationContract,
  DirectCostAllocationTransitionRequest,
  ProjectCostItemContract,
  ProjectCostSourceContract,
} from "@naai-erp/contracts";
export type ProjectCostItem = ProjectCostItemContract;
export type UnallocatedCostSource = ProjectCostSourceContract;
export type DirectCostAllocation = DirectCostAllocationContract;
export type CreateDirectCostAllocationBody = CreateDirectCostAllocationRequest;
export type DirectCostAllocationTransitionBody = DirectCostAllocationTransitionRequest;
const allocationPath = (id: string) => `direct-cost-allocations/${encodeURIComponent(id)}`;
export const projectCostApi = Object.freeze({
  costs(projectId: string, query = "") {
    return `project-costs?projectId=${encodeURIComponent(projectId)}${query ? `&${query}` : ""}`;
  },
  unallocated: "project-cost-sources/unallocated",
  allocations: "direct-cost-allocations",
  allocation: allocationPath,
  allocationAction(id: string, action: string) {
    return `${allocationPath(id)}/${action}`;
  },
});
