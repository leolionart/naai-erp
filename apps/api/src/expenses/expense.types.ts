import type { JournalActorContext } from "../journals/journal.types.js";
import type { FundingInputContract } from "@naai-erp/contracts";

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
  expenseCategoryCode?: string;
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
export type ExternalReferenceInput = Readonly<{
  system: string;
  externalId: string;
  canonicalUrl?: string;
  checksum?: string;
  version?: string;
  syncedAt?: string;
  metadata?: Readonly<Record<string, unknown>>;
}>;

export type CreateExpenseInput = Readonly<{
  id?: string;
  expenseClass: string;
  payeePartyId?: string;
  employeePartyId?: string;
  expenseDate: string;
  freelanceDueDate?: string;
  servicePeriodStart?: string;
  servicePeriodEnd?: string;
  businessPurpose: string;
  currency: string;
  netMinor: string;
  vatMinor: string;
  grossMinor: string;
  counterAccountCode: string;
  /** Canonical funding contract; legacy line fundingTreatment remains supported. */
  funding?: FundingInputContract;
  evidenceChecklist?: Readonly<Record<string, boolean>>;
  lines: readonly ExpenseLineInput[];
  externalReference?: ExternalReferenceInput;
}>;
export type ExpenseReviewInput = Readonly<{
  axis: ExpenseAxis;
  lineNumber: number;
  state: string;
  eligibleMinor?: string;
  reason: string;
  reference?: string;
}>;
export type ExpenseCategoryInput = Readonly<{
  category: string;
}>;
export type ExpenseMetadataInput = Readonly<{
  payeePartyId?: string | null;
  /** Optional customer/party relationship for cross-charge or project costs. */
  customerPartyId?: string | null;
  /** Organization-scoped project relationship applied to all lines. */
  projectId?: string | null;
  businessPurpose?: string;
  category?: string | null;
  lineDescriptions?: readonly Readonly<{
    lineNumber: number;
    description: string;
  }>[];
}>;
export type TaxFinalizationInput = Readonly<{ reason: string; planHash?: string }>;
