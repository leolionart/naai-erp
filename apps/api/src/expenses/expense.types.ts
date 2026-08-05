import type { JournalActorContext } from "../journals/journal.types.js";

export type ExpenseContext = JournalActorContext;
export type ExpenseAxis = "management" | "cit" | "vat";
export type ExpenseAllocationInput = Readonly<{
  id: string;
  amountMinor: string;
  dimensions: Readonly<Record<string, string>>;
}>;
export type ExpenseLineInput = Readonly<{
  description: string;
  netMinor: string;
  vatMinor: string;
  grossMinor: string;
  postingAccountCode: string;
  vatAccountCode?: string;
  dimensions?: Readonly<Record<string, string>>;
  managementState?: "unreviewed" | "valid" | "invalid" | "accountant_override";
  citState?:
    "unreviewed" | "eligible" | "partially_eligible" | "ineligible" | "accountant_override";
  vatState?:
    "unreviewed" | "eligible" | "partially_eligible" | "ineligible" | "accountant_override";
  citEligibleMinor?: string;
  vatEligibleMinor?: string;
  allocations: readonly ExpenseAllocationInput[];
}>;
export type CreateExpenseInput = Readonly<{
  id?: string;
  expenseClass: string;
  payeePartyId?: string;
  employeePartyId?: string;
  expenseDate: string;
  servicePeriodStart?: string;
  servicePeriodEnd?: string;
  businessPurpose: string;
  currency: string;
  netMinor: string;
  vatMinor: string;
  grossMinor: string;
  counterAccountCode: string;
  evidenceChecklist?: Readonly<Record<string, boolean>>;
  lines: readonly ExpenseLineInput[];
}>;
export type ExpenseReviewInput = Readonly<{
  axis: ExpenseAxis;
  lineNumber: number;
  state: string;
  eligibleMinor?: string;
  reason: string;
  reference?: string;
}>;
