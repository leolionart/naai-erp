import { describe, expect, it } from "vitest";
import {
  assertPaymentSettlementAllowed,
  assertPostingAllowed,
  createFiscalPeriodWorkflow,
  findFiscalPeriod,
  lockFiscalPeriod,
  reopenFiscalPeriod,
} from "./fiscal-period-workflow.js";
import {
  createCalendarYearPeriods,
  createOrganization,
  type FiscalPeriod,
} from "./organization-setup.js";

const organization = createOrganization({
  id: "org-naai",
  legalName: "NAAI Studio",
  baseCurrency: "VND",
  timezone: "Asia/Ho_Chi_Minh",
});

function periods() {
  return createCalendarYearPeriods(organization, 2026);
}

describe("ERP-230 fiscal period close and reopen", () => {
  it("enforces open to soft lock to hard lock transitions with audit events", () => {
    const workflow = createFiscalPeriodWorkflow(periods()[0]!);
    expect(() =>
      lockFiscalPeriod(workflow, {
        targetState: "hard_locked",
        actorId: "finance",
        approvedBy: "owner",
        occurredAt: "2026-02-01T00:00:00Z",
        reason: "Month close",
      }),
    ).toThrow("Invalid fiscal period lock transition");
    const soft = lockFiscalPeriod(workflow, {
      targetState: "soft_locked",
      actorId: "finance",
      approvedBy: "owner",
      occurredAt: "2026-02-01T00:00:00Z",
      reason: "Review window",
    });
    const hard = lockFiscalPeriod(soft, {
      targetState: "hard_locked",
      actorId: "finance",
      approvedBy: "owner",
      occurredAt: "2026-02-02T00:00:00Z",
      reason: "January approved",
    });
    expect(hard.period.state).toBe("hard_locked");
    expect(hard.events).toEqual([
      expect.objectContaining({
        action: "soft_locked",
        reason: "Review window",
        approverId: "owner",
      }),
      expect.objectContaining({ action: "hard_locked", reconciliationRequired: true }),
    ]);
  });

  it("allows normal posting when open and only configured/elevated actors when soft locked", () => {
    const january = periods()[0]!;
    expect(
      assertPostingAllowed({
        periods: [january],
        organizationId: "org-naai",
        postingDate: "2026-01-31",
        actorRoles: ["viewer"],
        softLockPostingRoles: ["accountant", "finance_admin"],
      }).state,
    ).toBe("open");
    const soft: FiscalPeriod = { ...january, state: "soft_locked" };
    expect(() =>
      assertPostingAllowed({
        periods: [soft],
        organizationId: "org-naai",
        postingDate: "2026-01-31",
        actorRoles: ["viewer"],
        softLockPostingRoles: ["accountant"],
      }),
    ).toThrow("requires an allowed finance role");
    expect(
      assertPostingAllowed({
        periods: [soft],
        organizationId: "org-naai",
        postingDate: "2026-01-31",
        actorRoles: ["accountant"],
        softLockPostingRoles: ["accountant"],
      }).state,
    ).toBe("soft_locked");
    expect(
      assertPostingAllowed({
        periods: [soft],
        organizationId: "org-naai",
        postingDate: "2026-01-31",
        actorRoles: ["viewer"],
        softLockPostingRoles: ["accountant"],
        hasElevatedPermission: true,
      }).state,
    ).toBe("soft_locked");
  });

  it("denies all hard-locked posting and backdating even for elevated actors", () => {
    const hard: FiscalPeriod = { ...periods()[0]!, state: "hard_locked" };
    expect(() =>
      assertPostingAllowed({
        periods: [hard],
        organizationId: "org-naai",
        postingDate: "2026-01-15",
        actorRoles: ["finance_admin"],
        softLockPostingRoles: ["finance_admin"],
        hasElevatedPermission: true,
      }),
    ).toThrow("rejects posting and backdating");
  });

  it("requires elevated permission, reason and distinct approval when reopening", () => {
    const hard = createFiscalPeriodWorkflow({ ...periods()[0]!, state: "hard_locked" });
    expect(() =>
      reopenFiscalPeriod(hard, {
        requestedBy: "finance",
        approvedBy: "owner",
        occurredAt: "2026-02-05T00:00:00Z",
        reason: "Correction",
        hasElevatedPermission: false,
        policy: { requireDistinctApprover: true },
      }),
    ).toThrow("Elevated permission");
    expect(() =>
      reopenFiscalPeriod(hard, {
        requestedBy: "owner",
        approvedBy: "owner",
        occurredAt: "2026-02-05T00:00:00Z",
        reason: "Correction",
        hasElevatedPermission: true,
        policy: { requireDistinctApprover: true },
      }),
    ).toThrow("distinct approver");
    const reopened = reopenFiscalPeriod(hard, {
      requestedBy: "finance",
      approvedBy: "owner",
      occurredAt: "2026-02-05T00:00:00Z",
      reason: "Approved correction",
      hasElevatedPermission: true,
      policy: { requireDistinctApprover: true },
    });
    expect(reopened.period.state).toBe("open");
    expect(reopened.events.at(-1)).toMatchObject({
      action: "reopened",
      approverId: "owner",
      reason: "Approved correction",
      reconciliationRequired: true,
    });
  });

  it("finds periods by organization and date and rejects gaps or overlaps", () => {
    expect(
      findFiscalPeriod(periods(), { organizationId: "org-naai", date: "2026-02-28" }).periodNumber,
    ).toBe(2);
    expect(() =>
      findFiscalPeriod(periods(), { organizationId: "org-other", date: "2026-02-28" }),
    ).toThrow("No fiscal period");
    const january = periods()[0]!;
    expect(() =>
      findFiscalPeriod([january, { ...january, periodNumber: 99 }], {
        organizationId: "org-naai",
        date: "2026-01-10",
      }),
    ).toThrow("Multiple fiscal periods");
  });

  it("settles in an open period against a locked original without mutating the original", () => {
    const source = periods();
    const lockedJanuary: FiscalPeriod = { ...source[0]!, state: "hard_locked" };
    const february = source[1]!;
    const result = assertPaymentSettlementAllowed({
      periods: [lockedJanuary, february],
      organizationId: "org-naai",
      originalJournalDate: "2026-01-15",
      settlementDate: "2026-02-10",
    });
    expect(result.originalPeriod.state).toBe("hard_locked");
    expect(result.settlementPeriod.state).toBe("open");
    expect(lockedJanuary.state).toBe("hard_locked");
  });
});
