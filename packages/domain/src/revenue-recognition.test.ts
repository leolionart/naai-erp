import { describe, expect, it } from "vitest";
import {
  acceptMilestone,
  approveRevenueRecognitionEvent,
  approveRevenueRecognitionPolicy,
  buildProjectRevenueAxes,
  buildRecognitionJournalLines,
  createMilestoneAcceptance,
  createRevenueRecognitionEvent,
  createRevenueRecognitionPolicy,
  postRevenueRecognitionEvent,
  reviewMilestoneAcceptance,
  submitRevenueRecognitionEvent,
} from "./revenue-recognition.js";

const policy = () =>
  approveRevenueRecognitionPolicy(
    createRevenueRecognitionPolicy({
      organizationId: "org-1",
      id: "policy-1",
      projectId: "project-1",
      contractId: "contract-1",
      method: "milestone_acceptance",
      effectiveFrom: "2026-01-01",
      revenueAccountCode: "511",
      deferredRevenueAccountCode: "3387",
      contractAssetAccountCode: "337",
      evidenceRequirements: ["acceptance-document"],
    }),
    [],
    "finance-1",
  );
const acceptance = () =>
  acceptMilestone({
    acceptance: createMilestoneAcceptance({
      organizationId: "org-1",
      id: "acceptance-1",
      milestoneId: "milestone-1",
      milestoneAmountMinor: 1_000n,
      reason: "Awaiting client acceptance",
    }),
    actorId: "manager-1",
    acceptedOn: "2026-08-15",
    acceptedPercentage: "50",
    evidenceIds: ["acceptance-document"],
    reason: "Client accepted phase one",
  });

describe("revenue recognition", () => {
  it("blocks disputed milestones and caps cumulative recognition", () => {
    const disputed = reviewMilestoneAcceptance(
      createMilestoneAcceptance({
        organizationId: "org-1",
        id: "a",
        milestoneId: "milestone-1",
        milestoneAmountMinor: 1_000n,
        reason: "Review",
      }),
      "disputed",
      "manager-1",
      "Client disputed delivery",
    );
    expect(() =>
      createRevenueRecognitionEvent({
        organizationId: "org-1",
        id: "event-1",
        projectId: "project-1",
        contractId: "contract-1",
        milestoneId: "milestone-1",
        policy: policy(),
        acceptance: disputed,
        recognitionDate: "2026-08-15",
        currency: "VND",
        amountMinor: 500n,
        baseAmountMinor: 500n,
        priorRecognizedMinor: 0n,
        eligibleAmountMinor: 500n,
        accountingRoute: "deferred_revenue",
        sourceEvidenceIds: ["acceptance-document"],
      }),
    ).toThrow("accepted milestone");
    expect(() =>
      createRevenueRecognitionEvent({
        organizationId: "org-1",
        id: "event-1",
        projectId: "project-1",
        contractId: "contract-1",
        milestoneId: "milestone-1",
        policy: policy(),
        acceptance: acceptance(),
        recognitionDate: "2026-08-15",
        currency: "VND",
        amountMinor: 500n,
        baseAmountMinor: 500n,
        priorRecognizedMinor: 100n,
        eligibleAmountMinor: 500n,
        accountingRoute: "deferred_revenue",
        sourceEvidenceIds: ["acceptance-document"],
      }),
    ).toThrow("exceeds eligible");
  });

  it("posts balanced deferred-revenue recognition with maker checker and period control", () => {
    const event = createRevenueRecognitionEvent({
      organizationId: "org-1",
      id: "event-1",
      projectId: "project-1",
      contractId: "contract-1",
      milestoneId: "milestone-1",
      policy: policy(),
      acceptance: acceptance(),
      recognitionDate: "2026-08-15",
      currency: "VND",
      amountMinor: 500n,
      baseAmountMinor: 500n,
      priorRecognizedMinor: 0n,
      eligibleAmountMinor: 500n,
      accountingRoute: "deferred_revenue",
      sourceEvidenceIds: ["acceptance-document"],
    });
    expect(buildRecognitionJournalLines(event, policy())).toEqual([
      expect.objectContaining({ accountCode: "3387", debitMinor: 500n }),
      expect.objectContaining({ accountCode: "511", creditMinor: 500n }),
    ]);
    const submitted = submitRevenueRecognitionEvent(event, "manager-1");
    expect(() => approveRevenueRecognitionEvent(submitted, "manager-1")).toThrow("MAKER_CHECKER");
    const approved = approveRevenueRecognitionEvent(submitted, "finance-1");
    expect(() =>
      postRevenueRecognitionEvent(approved, {
        actorId: "finance-1",
        journalId: "journal-1",
        periodState: "hard_locked",
        roles: ["finance_admin"],
      }),
    ).toThrow("HARD_LOCKED");
    expect(
      postRevenueRecognitionEvent(approved, {
        actorId: "finance-1",
        journalId: "journal-1",
        periodState: "open",
        roles: ["finance_admin"],
      }),
    ).toMatchObject({ state: "posted", journalId: "journal-1" });
  });

  it("reports recognized invoiced and collected axes separately", () => {
    const axes = buildProjectRevenueAxes({
      projectId: "project-1",
      startsOn: "2026-08-01",
      endsOn: "2026-08-31",
      currency: "VND",
      movements: [
        {
          projectId: "project-1",
          effectiveOn: "2026-08-10",
          currency: "VND",
          invoicedNetMinor: 1_000n,
          invoiceId: "invoice-1",
        },
        {
          projectId: "project-1",
          effectiveOn: "2026-08-15",
          currency: "VND",
          recognizedNetMinor: 500n,
          deferredRevenueMinor: 500n,
          recognitionEventId: "event-1",
          journalId: "journal-1",
        },
        {
          projectId: "project-1",
          effectiveOn: "2026-08-20",
          currency: "VND",
          collectedGrossMinor: 550n,
          collectedNetMinor: 500n,
          reconciliationId: "rec-1",
        },
      ],
    });
    expect(axes).toMatchObject({
      recognizedNetMinor: 500n,
      invoicedNetMinor: 1_000n,
      collectedGrossMinor: 550n,
      collectedNetMinor: 500n,
    });
  });
});
