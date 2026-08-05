import { describe, expect, it } from "vitest";
import {
  approveDirectCostAllocation,
  assertSourceNotDirectAndOverhead,
  createDirectCostAllocation,
  createProjectCostSource,
  createSourceLinkedProjectCost,
  materializeDirectProjectCosts,
  postDirectCostAllocation,
  reverseDirectCostAllocation,
  submitDirectCostAllocation,
  type ProjectCostSource,
} from "./project-costs.js";

const event = {
  actorId: "finance-1",
  occurredAt: "2026-08-31T17:00:00+07:00",
  reason: "Project attribution",
};
const source = (overrides: Partial<ProjectCostSource> = {}): ProjectCostSource => ({
  organizationId: "org-1",
  id: "source-1",
  sourceType: "expense_allocation",
  sourceId: "expense-1",
  sourceLineId: "line-1",
  sourceAllocationId: "allocation-1",
  costClass: "project_tool",
  basis: "ledger",
  effectiveOn: "2026-08-15",
  currency: "VND",
  amountMinor: 1_000n,
  baseAmountMinor: 1_000n,
  remainingAmountMinor: 1_000n,
  remainingBaseAmountMinor: 1_000n,
  disposition: "unallocated",
  ledgerAccountCode: "642",
  journalId: "journal-source",
  journalLineId: "journal-line-source",
  evidenceIds: ["evidence-1"],
  ...overrides,
});
const allocation = () =>
  createDirectCostAllocation({
    organizationId: "org-1",
    id: "direct-1",
    source: source(),
    splits: [
      {
        id: "split-a",
        projectId: "project-a",
        projectState: "active",
        amountMinor: 600n,
        baseAmountMinor: 600n,
      },
      {
        id: "split-b",
        projectId: "project-b",
        projectState: "completed",
        amountMinor: 400n,
        baseAmountMinor: 400n,
      },
    ],
    ...event,
  });

describe("direct project costs", () => {
  it("requires ledger and management sources to preserve their distinct drill-down basis", () => {
    expect(createProjectCostSource(source())).toMatchObject({
      basis: "ledger",
      journalId: "journal-source",
    });
    const {
      journalId: _journalId,
      journalLineId: _journalLineId,
      ...sourceWithoutJournal
    } = source();
    void _journalId;
    void _journalLineId;
    expect(
      createProjectCostSource({
        ...sourceWithoutJournal,
        basis: "management",
        sourceType: "timesheet_cost",
        timesheetId: "sheet-1",
        workerId: "worker-1",
      }),
    ).toMatchObject({ basis: "management", timesheetId: "sheet-1" });
    expect(() =>
      createProjectCostSource({
        ...sourceWithoutJournal,
        basis: "management",
        sourceType: "timesheet_cost",
      }),
    ).toThrow("timesheet source and drill-down");
  });

  it("materializes already project-attributed source allocations without copying editable cost", () => {
    const item = createSourceLinkedProjectCost({
      source: source({
        disposition: "direct",
        remainingAmountMinor: 0n,
        remainingBaseAmountMinor: 0n,
      }),
      projectId: "project-a",
      projectState: "active",
    });
    expect(item).toMatchObject({
      id: "source:source-1",
      projectId: "project-a",
      sourceAllocationId: "allocation-1",
      journalId: "journal-source",
      evidenceIds: ["evidence-1"],
    });
  });

  it("allocates the exact remaining document and base amounts", () => {
    expect(allocation().splits.map((split) => split.amountMinor)).toEqual([600n, 400n]);
    expect(() =>
      createDirectCostAllocation({
        organizationId: "org-1",
        id: "bad",
        source: source(),
        splits: [
          {
            id: "split",
            projectId: "project-a",
            projectState: "active",
            amountMinor: 999n,
            baseAmountMinor: 999n,
          },
        ],
        ...event,
      }),
    ).toThrow("exactly allocate");
  });

  it("rejects closed projects and sources reserved for overhead", () => {
    expect(() =>
      createDirectCostAllocation({
        organizationId: "org-1",
        id: "closed",
        source: source(),
        splits: [
          {
            id: "split",
            projectId: "project-a",
            projectState: "closed",
            amountMinor: 1_000n,
            baseAmountMinor: 1_000n,
          },
        ],
        ...event,
      }),
    ).toThrow("Closed project");
    expect(() =>
      createDirectCostAllocation({
        organizationId: "org-1",
        id: "overhead",
        source: source({ disposition: "overhead_reserved" }),
        splits: [
          {
            id: "split",
            projectId: "project-a",
            projectState: "active",
            amountMinor: 1_000n,
            baseAmountMinor: 1_000n,
          },
        ],
        ...event,
      }),
    ).toThrow("RESERVED_FOR_OVERHEAD");
  });

  it("enforces maker checker and immutable post/reversal journal references", () => {
    const submitted = submitDirectCostAllocation(allocation(), event);
    expect(() => approveDirectCostAllocation(submitted, event)).toThrow("MAKER_CHECKER");
    const approved = approveDirectCostAllocation(submitted, { ...event, actorId: "approver-1" });
    expect(() => postDirectCostAllocation(approved, event)).toThrow("reclassification journal");
    const posted = postDirectCostAllocation(approved, { ...event, journalId: "journal-reclass" });
    expect(materializeDirectProjectCosts(posted)).toEqual([
      expect.objectContaining({
        projectId: "project-a",
        basis: "ledger",
        amountMinor: 600n,
        journalId: "journal-reclass",
        evidenceIds: ["evidence-1"],
      }),
      expect.objectContaining({
        projectId: "project-b",
        basis: "ledger",
        amountMinor: 400n,
        journalId: "journal-reclass",
        evidenceIds: ["evidence-1"],
      }),
    ]);
    expect(() => reverseDirectCostAllocation(posted, event)).toThrow("reversal journal");
    expect(
      reverseDirectCostAllocation(posted, { ...event, reversalJournalId: "journal-reversal" }),
    ).toMatchObject({ state: "reversed", reversalJournalId: "journal-reversal" });
  });

  it("fails loudly when the same source enters direct and overhead pools", () => {
    expect(() =>
      assertSourceNotDirectAndOverhead({ directAllocatedMinor: 1n, overheadReservedMinor: 1n }),
    ).toThrow("DOUBLE_COUNT");
  });
});
