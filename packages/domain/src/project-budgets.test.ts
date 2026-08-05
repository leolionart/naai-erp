import { describe, expect, it } from "vitest";
import {
  approveProjectBudgetVersion,
  approveScopeChange,
  createProjectBudgetVersion,
  createScopeChange,
  submitProjectBudgetVersion,
  submitScopeChange,
  supersedeProjectBudgetVersion,
} from "./project-budgets.js";

const approvedScope = () =>
  approveScopeChange(
    submitScopeChange(
      createScopeChange({
        organizationId: "org-1",
        id: "scope-1",
        projectId: "project-1",
        reason: "Additional application module",
        expectedRevenueImpactMinor: 500n,
        expectedCostImpactMinor: 300n,
        expectedScheduleImpactDays: 7,
        evidenceIds: ["evidence-1"],
      }),
      "manager-1",
    ),
    "approver-1",
  );

describe("project budget versions and scope changes", () => {
  it("preserves exact baseline totals and maker checker", () => {
    const draft = createProjectBudgetVersion({
      organizationId: "org-1",
      id: "budget-1",
      projectId: "project-1",
      versionNumber: 1,
      kind: "baseline",
      currency: "VND",
      effectiveOn: "2026-08-01",
      lines: [
        { id: "revenue", category: "revenue", amountMinor: 1_000n },
        { id: "labor", category: "labor", amountMinor: 400n },
        { id: "overhead", category: "overhead", amountMinor: 100n },
      ],
    });
    expect(draft).toMatchObject({
      revenueTotalMinor: 1_000n,
      directCostTotalMinor: 400n,
      overheadTotalMinor: 100n,
    });
    const submitted = submitProjectBudgetVersion(draft, "manager-1");
    expect(() => approveProjectBudgetVersion(submitted, [], "manager-1")).toThrow("MAKER_CHECKER");
    expect(approveProjectBudgetVersion(submitted, [], "approver-1").state).toBe("approved");
  });

  it("requires revisions to follow an approved version and approved scope change", () => {
    const baseline = approveProjectBudgetVersion(
      submitProjectBudgetVersion(
        createProjectBudgetVersion({
          organizationId: "org-1",
          id: "budget-1",
          projectId: "project-1",
          versionNumber: 1,
          kind: "baseline",
          currency: "VND",
          effectiveOn: "2026-08-01",
          lines: [{ id: "revenue", category: "revenue", amountMinor: 1_000n }],
        }),
        "manager-1",
      ),
      [],
      "approver-1",
    );
    const revision = createProjectBudgetVersion({
      organizationId: "org-1",
      id: "budget-2",
      projectId: "project-1",
      versionNumber: 2,
      kind: "revision",
      previousVersionId: baseline.id,
      scopeChange: approvedScope(),
      currency: "VND",
      effectiveOn: "2026-08-15",
      lines: [{ id: "revenue", category: "revenue", amountMinor: 1_500n }],
    });
    const approved = approveProjectBudgetVersion(
      submitProjectBudgetVersion(revision, "manager-1"),
      [baseline],
      "approver-1",
    );
    expect(approved.state).toBe("approved");
    expect(supersedeProjectBudgetVersion(baseline).state).toBe("superseded");
  });
});
