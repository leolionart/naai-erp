import {
  approveJournal,
  journalTotals,
  postJournal,
  reverseJournal,
  type JournalEntry,
} from "./journal.js";

export type MakerCheckerPolicy = Readonly<{
  selfApprovalThresholdMinor: bigint;
  allowSmallTeamSelfApproval: boolean;
}>;

export type WorkflowAuditAction =
  "submitted" | "approved" | "posted" | "reversed" | "reversal_created" | "replacement_created";

export type WorkflowAuditEvent = Readonly<{
  action: WorkflowAuditAction;
  actorId: string;
  occurredAt: string;
  selfApproval?: boolean;
  relatedJournalId?: string;
}>;

export type AccountingWorkflow = Readonly<{
  journal: JournalEntry;
  submittedBy: string;
  approvedBy?: string;
  postedBy?: string;
  reversedBy?: string;
  replacesJournalId?: string;
  replacementJournalId?: string;
  audit: readonly WorkflowAuditEvent[];
}>;

function required(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function timestamp(value: string): string {
  if (Number.isNaN(Date.parse(value))) throw new Error("Workflow timestamp must be valid");
  return value;
}

function event(input: WorkflowAuditEvent): WorkflowAuditEvent {
  return Object.freeze({ ...input });
}

function immutableWorkflow(workflow: AccountingWorkflow): AccountingWorkflow {
  return Object.freeze({ ...workflow, audit: Object.freeze([...workflow.audit]) });
}

export function createAccountingWorkflow(input: {
  journal: JournalEntry;
  submittedBy: string;
  submittedAt: string;
  replacesJournalId?: string;
}): AccountingWorkflow {
  if (input.journal.state !== "draft") {
    throw new Error("Accounting workflow must start from a draft journal");
  }
  const submittedBy = required(input.submittedBy, "Submitter");
  return immutableWorkflow({
    journal: input.journal,
    submittedBy,
    ...(input.replacesJournalId
      ? { replacesJournalId: required(input.replacesJournalId, "Replaced journal ID") }
      : {}),
    audit: [
      event({
        action: "submitted",
        actorId: submittedBy,
        occurredAt: timestamp(input.submittedAt),
      }),
    ],
  });
}

export function approveAccountingWorkflow(
  workflow: AccountingWorkflow,
  input: { approverId: string; approvedAt: string; policy: MakerCheckerPolicy },
): AccountingWorkflow {
  if (workflow.journal.state !== "draft") {
    throw new Error(
      `Only draft workflows can be approved; current state is ${workflow.journal.state}`,
    );
  }
  if (input.policy.selfApprovalThresholdMinor < 0n) {
    throw new Error("Self-approval threshold cannot be negative");
  }
  const approverId = required(input.approverId, "Approver");
  const approvedAt = timestamp(input.approvedAt);
  const isSelfApproval = approverId === workflow.submittedBy;
  if (isSelfApproval) {
    const amountMinor = journalTotals(workflow.journal).debitMinor;
    if (amountMinor > input.policy.selfApprovalThresholdMinor) {
      throw new Error("Submitter cannot approve a journal above the maker-checker threshold");
    }
    if (!input.policy.allowSmallTeamSelfApproval) {
      throw new Error("Maker-checker policy requires a different approver");
    }
  }
  return immutableWorkflow({
    ...workflow,
    journal: approveJournal(workflow.journal, approvedAt),
    approvedBy: approverId,
    audit: [
      ...workflow.audit,
      event({
        action: "approved",
        actorId: approverId,
        occurredAt: approvedAt,
        ...(isSelfApproval ? { selfApproval: true } : {}),
      }),
    ],
  });
}

export function postAccountingWorkflow(
  workflow: AccountingWorkflow,
  input: { postedBy: string; postedAt: string },
): AccountingWorkflow {
  if (workflow.journal.state !== "approved") {
    throw new Error(
      `Only approved workflows can be posted; current state is ${workflow.journal.state}`,
    );
  }
  const postedBy = required(input.postedBy, "Posting actor");
  const postedAt = timestamp(input.postedAt);
  return immutableWorkflow({
    ...workflow,
    journal: postJournal(workflow.journal, postedAt),
    postedBy,
    audit: [
      ...workflow.audit,
      event({ action: "posted", actorId: postedBy, occurredAt: postedAt }),
    ],
  });
}

export function reverseAccountingWorkflow(
  workflow: AccountingWorkflow,
  input: {
    reversedBy: string;
    reversedAt: string;
    reversalJournalId: string;
    reversalDate: string;
    description?: string;
  },
): Readonly<{ original: AccountingWorkflow; reversal: AccountingWorkflow }> {
  if (workflow.journal.state !== "posted") {
    throw new Error(
      `Only posted workflows can be reversed; current state is ${workflow.journal.state}`,
    );
  }
  const reversedBy = required(input.reversedBy, "Reversal actor");
  const reversedAt = timestamp(input.reversedAt);
  const journals = reverseJournal(workflow.journal, {
    reversalJournalId: input.reversalJournalId,
    reversalDate: input.reversalDate,
    reversedAt,
    ...(input.description ? { description: input.description } : {}),
  });
  const original = immutableWorkflow({
    ...workflow,
    journal: journals.original,
    reversedBy,
    audit: [
      ...workflow.audit,
      event({
        action: "reversed",
        actorId: reversedBy,
        occurredAt: reversedAt,
        relatedJournalId: journals.reversal.id,
      }),
    ],
  });
  const reversal = immutableWorkflow({
    journal: journals.reversal,
    submittedBy: reversedBy,
    approvedBy: reversedBy,
    postedBy: reversedBy,
    audit: [
      event({
        action: "reversal_created",
        actorId: reversedBy,
        occurredAt: reversedAt,
        relatedJournalId: workflow.journal.id,
      }),
    ],
  });
  return Object.freeze({ original, reversal });
}

export function createReplacementWorkflow(
  reversedWorkflow: AccountingWorkflow,
  input: { replacementJournal: JournalEntry; submittedBy: string; submittedAt: string },
): Readonly<{ original: AccountingWorkflow; replacement: AccountingWorkflow }> {
  if (reversedWorkflow.journal.state !== "reversed") {
    throw new Error("Replacement requires a reversed original journal");
  }
  if (reversedWorkflow.replacementJournalId) {
    throw new Error("Original journal already has a replacement");
  }
  if (input.replacementJournal.state !== "draft") {
    throw new Error("Replacement journal must be draft");
  }
  if (input.replacementJournal.organizationId !== reversedWorkflow.journal.organizationId) {
    throw new Error("Replacement journal must belong to the same organization");
  }
  if (input.replacementJournal.baseCurrency !== reversedWorkflow.journal.baseCurrency) {
    throw new Error("Replacement journal must use the same base currency");
  }
  if (input.replacementJournal.id === reversedWorkflow.journal.id) {
    throw new Error("Replacement journal must have a distinct ID");
  }
  const replacement = createAccountingWorkflow({
    journal: input.replacementJournal,
    submittedBy: input.submittedBy,
    submittedAt: input.submittedAt,
    replacesJournalId: reversedWorkflow.journal.id,
  });
  const submittedBy = required(input.submittedBy, "Replacement submitter");
  const submittedAt = timestamp(input.submittedAt);
  const original = immutableWorkflow({
    ...reversedWorkflow,
    replacementJournalId: replacement.journal.id,
    audit: [
      ...reversedWorkflow.audit,
      event({
        action: "replacement_created",
        actorId: submittedBy,
        occurredAt: submittedAt,
        relatedJournalId: replacement.journal.id,
      }),
    ],
  });
  return Object.freeze({ original, replacement });
}
