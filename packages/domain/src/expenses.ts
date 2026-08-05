import { createDraftJournal, type JournalDimensions, type JournalEntry } from "./journal.js";
import { currencyCode, type CurrencyCode } from "./organization-setup.js";
import { organizationId, type OrganizationId } from "./organization.js";

export const EXPENSE_CLASSES = [
  "invoice_backed",
  "receipt_backed",
  "contract_backed",
  "payroll_personnel",
  "bank_fee",
  "tax_payment",
  "non_documented",
  "owner_personal",
  "employee_reimbursement",
  "prepaid",
  "fixed_asset",
] as const;
export type ExpenseClass = (typeof EXPENSE_CLASSES)[number];
export type ExpenseState =
  "draft" | "submitted" | "evidence_pending" | "approved" | "rejected" | "posted";
export type ExpenseReviewState =
  "unreviewed" | "eligible" | "partially_eligible" | "ineligible" | "accountant_override";
export type ExpenseReviewAxis = "accounting" | "cit" | "vat";
export type AccountingTreatment =
  "operating_expense" | "prepaid_asset" | "fixed_asset" | "owner_draw" | "tax_asset_or_expense";

export type ExpenseEvidenceFlags = Readonly<{
  invoice: boolean;
  receipt: boolean;
  contract: boolean;
  payment: boolean;
  businessPurpose: boolean;
}>;

export type ExpenseReview = Readonly<{
  state: ExpenseReviewState;
  eligibleMinor?: bigint;
  reviewerId?: string;
  reason?: string;
  reviewedAt?: string;
  reference?: string;
}>;

export type Expense = Readonly<{
  organizationId: OrganizationId;
  id: string;
  expenseClass: ExpenseClass;
  state: ExpenseState;
  businessPurpose: string;
  payeeId: string;
  employeeId?: string;
  expenseDate: string;
  currency: CurrencyCode;
  netMinor: bigint;
  vatMinor: bigint;
  totalMinor: bigint;
  dimensions: JournalDimensions;
  treatment: AccountingTreatment;
  paymentSource: "company" | "employee";
  evidence: ExpenseEvidenceFlags;
  missingEvidence: readonly (keyof ExpenseEvidenceFlags)[];
  accountingReview: ExpenseReview;
  citReview: ExpenseReview;
  vatReview: ExpenseReview;
  approvedBy?: string;
  rejectedReason?: string;
}>;

function required(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function date(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error("Expense date must be an ISO date");
  }
  return value;
}

function requiredEvidence(expenseClass: ExpenseClass): readonly (keyof ExpenseEvidenceFlags)[] {
  const common = ["payment", "businessPurpose"] as const;
  switch (expenseClass) {
    case "invoice_backed":
    case "fixed_asset":
      return ["invoice", ...common];
    case "receipt_backed":
      return ["receipt", ...common];
    case "contract_backed":
    case "payroll_personnel":
    case "prepaid":
      return ["contract", ...common];
    case "bank_fee":
    case "tax_payment":
      return ["payment"];
    case "non_documented":
    case "owner_personal":
    case "employee_reimbursement":
      return common;
  }
}

function missing(expenseClass: ExpenseClass, evidence: ExpenseEvidenceFlags) {
  return Object.freeze(requiredEvidence(expenseClass).filter((flag) => !evidence[flag]));
}

function immutable(expense: Expense): Expense {
  return Object.freeze({
    ...expense,
    dimensions: Object.freeze({ ...expense.dimensions }),
    evidence: Object.freeze({ ...expense.evidence }),
    missingEvidence: Object.freeze([...expense.missingEvidence]),
    accountingReview: Object.freeze({ ...expense.accountingReview }),
    citReview: Object.freeze({ ...expense.citReview }),
    vatReview: Object.freeze({ ...expense.vatReview }),
  });
}

export function createExpense(input: {
  organizationId: string;
  id: string;
  expenseClass: ExpenseClass;
  businessPurpose: string;
  payeeId: string;
  employeeId?: string;
  expenseDate: string;
  currency: string;
  netMinor: bigint;
  vatMinor?: bigint;
  dimensions?: JournalDimensions;
  treatment: AccountingTreatment;
  paymentSource?: "company" | "employee";
  evidence?: Partial<ExpenseEvidenceFlags>;
}): Expense {
  const vatMinor = input.vatMinor ?? 0n;
  if (input.netMinor <= 0n || vatMinor < 0n) throw new Error("Expense amounts are invalid");
  if (input.expenseClass === "prepaid" && input.treatment !== "prepaid_asset") {
    throw new Error("Prepaid expense must use prepaid asset treatment");
  }
  if (input.expenseClass === "fixed_asset" && input.treatment !== "fixed_asset") {
    throw new Error("Fixed-asset expense must use fixed asset treatment");
  }
  if (input.expenseClass === "owner_personal" && input.treatment !== "owner_draw") {
    throw new Error("Owner/personal expense must use owner draw treatment");
  }
  const paymentSource = input.paymentSource ?? "company";
  if (input.expenseClass === "employee_reimbursement") {
    if (!input.employeeId?.trim()) throw new Error("Employee reimbursement requires employee ID");
    if (paymentSource !== "employee") {
      throw new Error("Employee reimbursement must identify employee-funded payment source");
    }
  }
  const evidence = Object.freeze({
    invoice: input.evidence?.invoice ?? false,
    receipt: input.evidence?.receipt ?? false,
    contract: input.evidence?.contract ?? false,
    payment: input.evidence?.payment ?? false,
    businessPurpose: input.evidence?.businessPurpose ?? Boolean(input.businessPurpose.trim()),
  });
  const unreviewed = Object.freeze({ state: "unreviewed" as const });
  return immutable({
    organizationId: organizationId(input.organizationId),
    id: required(input.id, "Expense ID"),
    expenseClass: input.expenseClass,
    state: "draft",
    businessPurpose: required(input.businessPurpose, "Business purpose"),
    payeeId: required(input.payeeId, "Payee ID"),
    ...(input.employeeId?.trim() ? { employeeId: input.employeeId.trim() } : {}),
    expenseDate: date(input.expenseDate),
    currency: currencyCode(input.currency),
    netMinor: input.netMinor,
    vatMinor,
    totalMinor: input.netMinor + vatMinor,
    dimensions: input.dimensions ?? {},
    treatment: input.treatment,
    paymentSource,
    evidence,
    missingEvidence: missing(input.expenseClass, evidence),
    accountingReview: unreviewed,
    citReview: unreviewed,
    vatReview:
      input.expenseClass === "non_documented"
        ? Object.freeze({ state: "ineligible" as const })
        : unreviewed,
  });
}

export function updateExpenseEvidence(
  expense: Expense,
  evidence: Partial<ExpenseEvidenceFlags>,
): Expense {
  if (["approved", "rejected", "posted"].includes(expense.state)) {
    throw new Error("Reviewed expense evidence cannot be silently edited");
  }
  const updated = Object.freeze({ ...expense.evidence, ...evidence });
  return immutable({
    ...expense,
    evidence: updated,
    missingEvidence: missing(expense.expenseClass, updated),
  });
}

export function reviewExpenseAxis(
  expense: Expense,
  input: {
    axis: ExpenseReviewAxis;
    state: Exclude<ExpenseReviewState, "unreviewed">;
    reviewerId: string;
    reason?: string;
    reviewedAt: string;
    reference?: string;
    eligibleMinor?: bigint;
  },
): Expense {
  if (Number.isNaN(Date.parse(input.reviewedAt))) throw new Error("Review timestamp is invalid");
  if (
    input.state === "accountant_override" &&
    (!input.reason?.trim() || !input.reference?.trim())
  ) {
    throw new Error("Accountant override requires reason and reference/evidence");
  }
  const maximum = input.axis === "vat" ? expense.vatMinor : expense.totalMinor;
  if (
    input.state === "partially_eligible" &&
    (input.eligibleMinor === undefined ||
      input.eligibleMinor <= 0n ||
      input.eligibleMinor >= maximum)
  ) {
    throw new Error(
      "Partial eligibility requires an eligible amount between zero and the axis total",
    );
  }
  if (
    input.eligibleMinor !== undefined &&
    (input.eligibleMinor < 0n || input.eligibleMinor > maximum)
  ) {
    throw new Error("Reviewed eligible amount exceeds the axis total");
  }
  const review = Object.freeze({
    state: input.state,
    ...(input.eligibleMinor !== undefined ? { eligibleMinor: input.eligibleMinor } : {}),
    reviewerId: required(input.reviewerId, "Reviewer ID"),
    ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}),
    reviewedAt: input.reviewedAt,
    ...(input.reference?.trim() ? { reference: input.reference.trim() } : {}),
  });
  const field = `${input.axis}Review` as const;
  return immutable({ ...expense, [field]: review });
}

export function transitionExpense(
  expense: Expense,
  input: { next: ExpenseState; approverId?: string; rejectionReason?: string },
): Expense {
  const allowed: Record<ExpenseState, readonly ExpenseState[]> = {
    draft: ["submitted"],
    submitted: ["evidence_pending"],
    evidence_pending: ["approved", "rejected"],
    approved: ["posted"],
    rejected: [],
    posted: [],
  };
  if (!allowed[expense.state].includes(input.next)) {
    throw new Error(`Invalid expense transition: ${expense.state} -> ${input.next}`);
  }
  if (input.next === "approved") {
    if (expense.missingEvidence.length) {
      throw new Error(`Expense evidence is incomplete: ${expense.missingEvidence.join(", ")}`);
    }
    if (
      expense.accountingReview.state === "unreviewed" ||
      expense.accountingReview.state === "ineligible"
    ) {
      throw new Error("Accounting recognition must be reviewed before approval");
    }
    return immutable({
      ...expense,
      state: "approved",
      approvedBy: required(input.approverId ?? "", "Approver"),
    });
  }
  if (input.next === "rejected") {
    return immutable({
      ...expense,
      state: "rejected",
      rejectedReason: required(input.rejectionReason ?? "", "Rejection reason"),
    });
  }
  return immutable({ ...expense, state: input.next });
}

function treatmentAccount(input: {
  expense: Expense;
  expenseAccountId: string;
  prepaidAccountId: string;
  fixedAssetAccountId: string;
  ownerDrawAccountId: string;
  taxAccountId: string;
}): string {
  switch (input.expense.treatment) {
    case "operating_expense":
      return input.expenseAccountId;
    case "prepaid_asset":
      return input.prepaidAccountId;
    case "fixed_asset":
      return input.fixedAssetAccountId;
    case "owner_draw":
      return input.ownerDrawAccountId;
    case "tax_asset_or_expense":
      return input.taxAccountId;
  }
}

export function generateExpenseBookingJournalDraft(
  expense: Expense,
  input: {
    journalId: string;
    expenseAccountId: string;
    prepaidAccountId: string;
    fixedAssetAccountId: string;
    ownerDrawAccountId: string;
    taxAccountId: string;
    vatInputAccountId: string;
    companySettlementAccountId: string;
    employeePayableAccountId: string;
  },
): JournalEntry {
  if (expense.state !== "approved") throw new Error("Expense must be approved before booking");
  const recognizedVat =
    expense.vatReview.state === "ineligible" || expense.vatReview.state === "unreviewed"
      ? 0n
      : expense.vatReview.state === "partially_eligible"
        ? expense.vatReview.eligibleMinor!
        : (expense.vatReview.eligibleMinor ?? expense.vatMinor);
  const primaryAmount = expense.netMinor + expense.vatMinor - recognizedVat;
  return createDraftJournal({
    organizationId: expense.organizationId,
    id: input.journalId,
    entryDate: expense.expenseDate,
    baseCurrency: expense.currency,
    description: `Expense ${expense.id}: ${expense.businessPurpose}`,
    lines: [
      {
        id: "expense-treatment",
        accountId: treatmentAccount({ expense, ...input }),
        debitMinor: primaryAmount,
        dimensions: expense.dimensions,
      },
      ...(recognizedVat > 0n
        ? [
            {
              id: "vat-input",
              accountId: input.vatInputAccountId,
              debitMinor: recognizedVat,
              dimensions: expense.dimensions.taxCode ? { taxCode: expense.dimensions.taxCode } : {},
            },
          ]
        : []),
      {
        id: "settlement",
        accountId:
          expense.expenseClass === "employee_reimbursement"
            ? input.employeePayableAccountId
            : input.companySettlementAccountId,
        creditMinor: expense.totalMinor,
      },
    ],
  });
}

export function generateReimbursementPaymentJournalDraft(
  expense: Expense,
  input: {
    journalId: string;
    employeePayableAccountId: string;
    bankAccountId: string;
    paymentDate: string;
  },
): JournalEntry {
  if (expense.expenseClass !== "employee_reimbursement" || expense.state !== "posted") {
    throw new Error("Only posted employee reimbursements can generate payment journals");
  }
  return createDraftJournal({
    organizationId: expense.organizationId,
    id: input.journalId,
    entryDate: input.paymentDate,
    baseCurrency: expense.currency,
    description: `Reimburse employee ${expense.employeeId}`,
    lines: [
      {
        id: "employee-payable",
        accountId: input.employeePayableAccountId,
        debitMinor: expense.totalMinor,
      },
      { id: "bank", accountId: input.bankAccountId, creditMinor: expense.totalMinor },
    ],
  });
}
