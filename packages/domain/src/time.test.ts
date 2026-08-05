import { describe, expect, it } from "vitest";
import {
  approveLaborCostRate,
  approveTimeAdjustment,
  approveTimesheet,
  assertNoTimeOverlap,
  buildTimeCapacitySummary,
  calculateAppliedLaborCost,
  createLaborCostRate,
  createTimeAdjustment,
  createTimesheet,
  createWorkerCapacityVersion,
  createWorkforceProfile,
  markTimesheetBilled,
  rejectTimesheet,
  resolveEffectiveCostRate,
  reviseRejectedTimesheet,
  submitTimeAdjustment,
  submitTimesheet,
  type TimeEntry,
} from "./time.js";

const event = {
  actorId: "worker-user",
  occurredAt: "2026-08-07T18:00:00+07:00",
  reason: "Weekly time",
};
const entry = (overrides: Partial<TimeEntry> = {}): TimeEntry => ({
  id: "entry-1",
  workDate: "2026-08-05",
  mode: "allocation",
  minutes: 480,
  workClassification: "project",
  billingClassification: "billable",
  projectId: "project-1",
  description: "Web application development",
  ...overrides,
});
const draftSheet = () =>
  createTimesheet({
    organizationId: "org-1",
    id: "sheet-1",
    workerId: "worker-1",
    weekStartsOn: "2026-08-03",
    entries: [entry()],
    ...event,
  });
const approvedRate = (from = "2026-01-01", to?: string) =>
  approveLaborCostRate(
    createLaborCostRate({
      organizationId: "org-1",
      id: `rate-${from}`,
      workerId: "worker-1",
      basis: "fully_loaded",
      currency: "VND",
      rateMinorPerHour: 101n,
      effectiveFrom: from,
      ...(to ? { effectiveTo: to } : {}),
    }),
    [],
    { actorId: "finance-1", approvedAt: "2026-01-01T00:00:00Z" },
  );

describe("workforce time and labor cost", () => {
  it("links worker party to an optional user with effective dates", () => {
    expect(
      createWorkforceProfile({
        organizationId: "org-1",
        id: "worker-1",
        workerPartyId: "party-employee-1",
        userId: "user-1",
        employmentKind: "employee",
        startsOn: "2026-01-01",
      }),
    ).toMatchObject({ status: "active", version: 1 });
  });

  it("prevents timed overlap but permits boundary-touching intervals", () => {
    const first = entry({
      id: "first",
      mode: "timed",
      startsAt: "2026-08-05T09:00:00+07:00",
      endsAt: "2026-08-05T10:00:00+07:00",
      minutes: 60,
    });
    const touching = entry({
      id: "touching",
      mode: "timed",
      startsAt: "2026-08-05T10:00:00+07:00",
      endsAt: "2026-08-05T11:00:00+07:00",
      minutes: 60,
    });
    expect(() => assertNoTimeOverlap([first, touching])).not.toThrow();
    expect(() =>
      assertNoTimeOverlap([
        first,
        { ...touching, startsAt: "2026-08-05T09:30:00+07:00", endsAt: "2026-08-05T10:30:00+07:00" },
      ]),
    ).toThrow("cannot overlap");
  });

  it("keeps project/internal and billable classifications explicit", () => {
    expect(() => draftSheet()).not.toThrow();
    const { projectId: _projectId, ...internalBillable } = entry();
    void _projectId;
    expect(() =>
      createTimesheet({
        organizationId: "org-1",
        id: "sheet-invalid",
        workerId: "worker-1",
        weekStartsOn: "2026-08-03",
        entries: [{ ...internalBillable, workClassification: "internal" }],
        ...event,
      }),
    ).toThrow("Only project time can be billable");
  });

  it("supports submit reject revise and maker-checker approval", () => {
    const submitted = submitTimesheet(draftSheet(), event);
    const rejected = rejectTimesheet(submitted, {
      ...event,
      actorId: "manager-1",
      reason: "Correct allocation",
    });
    expect(reviseRejectedTimesheet(rejected, event).state).toBe("draft");
    expect(() => approveTimesheet(submitted, [approvedRate()], event)).toThrow("MAKER_CHECKER");
    const approved = approveTimesheet(submitted, [approvedRate()], {
      ...event,
      actorId: "manager-1",
      reason: "Approved",
    });
    expect(approved.state).toBe("approved");
    expect(approved.entries[0]?.appliedCost).toMatchObject({
      rateVersionId: "rate-2026-01-01",
      costMinor: 808n,
    });
  });

  it("resolves the rate effective on work date and prevents overlapping approved ranges", () => {
    const old = approvedRate("2026-01-01", "2026-06-30");
    const currentDraft = createLaborCostRate({
      organizationId: "org-1",
      id: "rate-current",
      workerId: "worker-1",
      basis: "blended",
      currency: "VND",
      rateMinorPerHour: 120n,
      effectiveFrom: "2026-07-01",
    });
    const current = approveLaborCostRate(currentDraft, [old], {
      actorId: "finance-1",
      approvedAt: "2026-07-01T00:00:00Z",
    });
    expect(resolveEffectiveCostRate([old, current], "org-1", "worker-1", "2026-08-05").id).toBe(
      "rate-current",
    );
    expect(() =>
      approveLaborCostRate(
        createLaborCostRate({ ...currentDraft, id: "overlap", effectiveFrom: "2026-06-01" }),
        [old],
        { actorId: "finance-1", approvedAt: "2026-06-01T00:00:00Z" },
      ),
    ).toThrow("cannot overlap");
  });

  it("uses deterministic half-up cost rounding including negative adjustments", () => {
    const rate = approvedRate();
    expect(calculateAppliedLaborCost(1, rate).costMinor).toBe(2n);
    expect(calculateAppliedLaborCost(-1, rate).costMinor).toBe(-2n);
  });

  it("corrects approved time through append-only adjustment snapshots", () => {
    const approved = approveTimesheet(submitTimesheet(draftSheet(), event), [approvedRate()], {
      ...event,
      actorId: "manager-1",
    });
    const adjusted = createTimeAdjustment(approved, {
      id: "adjustment-1",
      originalEntryId: "entry-1",
      workDate: "2026-08-05",
      minutesDelta: -60,
      reason: "Correct duplicate hour",
      createdBy: "worker-user",
    });
    const submitted = submitTimeAdjustment(adjusted, "adjustment-1");
    const result = approveTimeAdjustment(submitted, "adjustment-1", [approvedRate()], "manager-1");
    expect(result.entries[0]?.minutes).toBe(480);
    expect(result.adjustments[0]).toMatchObject({ state: "approved", minutesDelta: -60 });
    expect(result.adjustments[0]?.appliedCost?.costMinor).toBe(-101n);
    expect(
      buildTimeCapacitySummary({
        workerId: "worker-1",
        startsOn: "2026-08-03",
        endsOn: "2026-08-09",
        capacityMinutes: 2_400,
        timesheets: [result],
      }),
    ).toMatchObject({ approvedMinutes: 420, billableMinutes: 420, unallocatedMinutes: 1_980 });
  });

  it("only bills sheets with billable time and an explicit reference", () => {
    const approved = approveTimesheet(submitTimesheet(draftSheet(), event), [approvedRate()], {
      ...event,
      actorId: "manager-1",
    });
    expect(
      markTimesheetBilled(approved, {
        ...event,
        actorId: "manager-1",
        billingReference: "INV-001",
      }),
    ).toMatchObject({ state: "billed", billingReference: "INV-001" });
  });

  it("builds approved billable and available minute summaries", () => {
    const approved = approveTimesheet(submitTimesheet(draftSheet(), event), [approvedRate()], {
      ...event,
      actorId: "manager-1",
    });
    const capacity = createWorkerCapacityVersion({
      organizationId: "org-1",
      id: "capacity-1",
      workerId: "worker-1",
      effectiveFrom: "2026-01-01",
      weeklyCapacityMinutes: 2_400,
      workdays: [1, 2, 3, 4, 5],
    });
    const summary = buildTimeCapacitySummary({
      workerId: "worker-1",
      startsOn: "2026-08-03",
      endsOn: "2026-08-09",
      capacityMinutes: capacity.weeklyCapacityMinutes,
      timesheets: [approved],
    });
    expect(summary).toMatchObject({
      approvedMinutes: 480,
      billableMinutes: 480,
      unallocatedMinutes: 1_920,
    });
  });
});
