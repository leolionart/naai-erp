import type { MutationMetadata } from "./index.js";
export const PROJECT_FREELANCE_PAYABLE_CONTRACT_VERSION = 1 as const;
export type FreelanceExpenseLinkContract = Readonly<{
  costClass: "freelancer";
  projectId: string;
  freelancerPartyId: string;
  dueDate: string;
}>;
export type RecordFreelancePayablePaymentRequest = Readonly<{
  schemaVersion: 1;
  financialAccountId: string;
  paymentDate: string;
  amountMinor: string;
  reason: string;
}>;
export type ProjectFreelancePayableContract = Readonly<{
  schemaVersion: 1;
  id: string;
  expenseId: string;
  projectId: string;
  freelancerPartyId: string;
  expenseDate: string;
  dueDate: string;
  amountMinor: string;
  paidMinor: string;
  outstandingMinor: string;
  currency: string;
  description: string;
  state: "unpaid" | "partially_paid" | "paid";
  journalId: string;
  paymentJournalIds: readonly string[];
  resourceVersion: string;
}>;
export type ProjectFreelancePayableMutationResult = ProjectFreelancePayableContract &
  MutationMetadata;
