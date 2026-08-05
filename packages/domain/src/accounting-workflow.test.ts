import { describe, expect, it } from "vitest";
import {
  approveAccountingWorkflow,
  createAccountingWorkflow,
  createReplacementWorkflow,
  postAccountingWorkflow,
  reverseAccountingWorkflow,
} from "./accounting-workflow.js";
import { approveJournal, createDraftJournal, journalTotals } from "./journal.js";

function draft(id = "journal-1", amount = 100n, organizationId = "org-naai") {
  return createDraftJournal({
    organizationId,
    id,
    entryDate: "2026-08-05",
    baseCurrency: "VND",
    description: "Service delivery",
    lines: [
      { id: `${id}-dr`, accountId: "expense", debitMinor: amount },
      { id: `${id}-cr`, accountId: "payable", creditMinor: amount },
    ],
  });
}

const strictPolicy = {
  selfApprovalThresholdMinor: 1_000n,
  allowSmallTeamSelfApproval: false,
} as const;

function submitted(amount = 100n) {
  return createAccountingWorkflow({
    journal: draft("journal-1", amount),
    submittedBy: "maker",
    submittedAt: "2026-08-05T01:00:00Z",
  });
}

function postedWorkflow() {
  return postAccountingWorkflow(
    approveAccountingWorkflow(submitted(), {
      approverId: "checker",
      approvedAt: "2026-08-05T02:00:00Z",
      policy: strictPolicy,
    }),
    { postedBy: "finance", postedAt: "2026-08-05T03:00:00Z" },
  );
}

describe("ERP-220 accounting workflow", () => {
  it("enforces maker-checker separation above the configured threshold", () => {
    expect(() =>
      approveAccountingWorkflow(submitted(1_001n), {
        approverId: "maker",
        approvedAt: "2026-08-05T02:00:00Z",
        policy: { selfApprovalThresholdMinor: 1_000n, allowSmallTeamSelfApproval: true },
      }),
    ).toThrow("above the maker-checker threshold");
  });

  it("allows configured small-team self-approval and explicitly audits the exception", () => {
    const approved = approveAccountingWorkflow(submitted(1_000n), {
      approverId: "maker",
      approvedAt: "2026-08-05T02:00:00Z",
      policy: { selfApprovalThresholdMinor: 1_000n, allowSmallTeamSelfApproval: true },
    });
    expect(approved.approvedBy).toBe("maker");
    expect(approved.audit.at(-1)).toMatchObject({ action: "approved", selfApproval: true });
  });

  it("rejects self-approval when the small-team exception is disabled", () => {
    expect(() =>
      approveAccountingWorkflow(submitted(), {
        approverId: "maker",
        approvedAt: "2026-08-05T02:00:00Z",
        policy: strictPolicy,
      }),
    ).toThrow("requires a different approver");
  });

  it("rejects invalid transitions and requires a complete balanced approved journal", () => {
    const workflow = submitted();
    expect(() =>
      postAccountingWorkflow(workflow, {
        postedBy: "finance",
        postedAt: "2026-08-05T03:00:00Z",
      }),
    ).toThrow("Only approved workflows");

    const unbalanced = createDraftJournal({
      organizationId: "org-naai",
      id: "unbalanced",
      entryDate: "2026-08-05",
      baseCurrency: "VND",
      description: "Incomplete accounting",
      lines: [
        { id: "dr", accountId: "expense", debitMinor: 100n },
        { id: "cr", accountId: "payable", creditMinor: 99n },
      ],
    });
    const approvedJournal = approveJournal(unbalanced, "2026-08-05T02:00:00Z");
    const invalidWorkflow = {
      ...createAccountingWorkflow({
        journal: unbalanced,
        submittedBy: "maker",
        submittedAt: "2026-08-05T01:00:00Z",
      }),
      journal: approvedJournal,
      approvedBy: "checker",
    };
    expect(() =>
      postAccountingWorkflow(invalidWorkflow, {
        postedBy: "finance",
        postedAt: "2026-08-05T03:00:00Z",
      }),
    ).toThrow("not balanced");
  });

  it("reverses with a linked inverse journal and prevents double reversal", () => {
    const posted = postedWorkflow();
    const result = reverseAccountingWorkflow(posted, {
      reversedBy: "finance",
      reversedAt: "2026-08-06T01:00:00Z",
      reversalJournalId: "reversal-1",
      reversalDate: "2026-08-06",
    });
    expect(result.original.journal).toMatchObject({
      state: "reversed",
      reversedByJournalId: "reversal-1",
    });
    expect(result.reversal.journal).toMatchObject({
      state: "posted",
      reversalOfJournalId: posted.journal.id,
    });
    expect(journalTotals(result.reversal.journal)).toEqual({ debitMinor: 100n, creditMinor: 100n });
    expect(result.reversal.journal.lines[0]!.creditMinor).toBe(posted.journal.lines[0]!.debitMinor);
    expect(() =>
      reverseAccountingWorkflow(result.original, {
        reversedBy: "finance",
        reversedAt: "2026-08-07T01:00:00Z",
        reversalJournalId: "reversal-2",
        reversalDate: "2026-08-07",
      }),
    ).toThrow("Only posted workflows");
  });

  it("links a draft replacement to the reversed original for repost processing", () => {
    const reversed = reverseAccountingWorkflow(postedWorkflow(), {
      reversedBy: "finance",
      reversedAt: "2026-08-06T01:00:00Z",
      reversalJournalId: "reversal-1",
      reversalDate: "2026-08-06",
    }).original;
    const result = createReplacementWorkflow(reversed, {
      replacementJournal: draft("replacement-1", 120n),
      submittedBy: "maker",
      submittedAt: "2026-08-06T02:00:00Z",
    });
    expect(result.original.replacementJournalId).toBe("replacement-1");
    expect(result.replacement).toMatchObject({
      replacesJournalId: reversed.journal.id,
      journal: { state: "draft" },
    });
    expect(() =>
      createReplacementWorkflow(result.original, {
        replacementJournal: draft("replacement-2"),
        submittedBy: "maker",
        submittedAt: "2026-08-06T03:00:00Z",
      }),
    ).toThrow("already has a replacement");
  });

  it("rejects replacement across organizations", () => {
    const reversed = reverseAccountingWorkflow(postedWorkflow(), {
      reversedBy: "finance",
      reversedAt: "2026-08-06T01:00:00Z",
      reversalJournalId: "reversal-1",
      reversalDate: "2026-08-06",
    }).original;
    expect(() =>
      createReplacementWorkflow(reversed, {
        replacementJournal: draft("replacement-1", 100n, "org-other"),
        submittedBy: "maker",
        submittedAt: "2026-08-06T02:00:00Z",
      }),
    ).toThrow("same organization");
  });
});
