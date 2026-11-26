import { randomUUID } from "node:crypto";
import { mergePaymentEvidenceFields } from "../payment-evidence/payment-input.helper.js";
import type { CreateExpenseInput, ExternalReferenceInput } from "./expense.types.js";

export interface ExistingExpenseRecord {
  expense_class: string;
  payee_party_id: string | null;
  employee_party_id: string | null;
  expense_date: Date | string;
  service_period_start: Date | string | null;
  service_period_end: Date | string | null;
  business_purpose: string;
  currency: string;
  net_minor: string | number;
  vat_minor: string | number;
  gross_minor: string | number;
  counter_account_code: string;
  funding_financial_account_id?: string | null;
  payment_method?: string | null;
  paymentMethod?: string | null;
  paid_on?: Date | string | null;
  paidOn?: Date | string | null;
  payment_evidence_ref?: string | null;
  paymentEvidenceRef?: string | null;
  transaction_evidence?: string | null;
  transactionEvidence?: string | null;
  evidence_checklist: Record<string, boolean> | null;
  externalReference?: {
    system: string;
    externalId: string;
    canonicalUrl?: string;
    checksum?: string;
    version?: string;
    metadata?: Record<string, unknown>;
  } | null;
  lines: Array<{
    lineNumber: number;
    description: string;
    netMinor: string | number;
    vatMinor: string | number;
    grossMinor: string | number;
    postingAccountCode: string;
    expenseCategoryCode?: string;
    vatAccountCode?: string;
    managementState?: "unreviewed" | "valid" | "invalid" | "accountant_override";
    citState?:
      "unreviewed" | "eligible" | "partially_eligible" | "ineligible" | "accountant_override";
    vatState?:
      "unreviewed" | "eligible" | "partially_eligible" | "ineligible" | "accountant_override";
    citEligibleMinor?: string | number;
    vatEligibleMinor?: string | number;
    dimensions?: Record<string, string>;
    allocations: Array<{
      id?: string;
      amount_minor: string | number;
      dimensions?: Record<string, string>;
    }>;
  }>;
}

export function mergeExpenseInput(
  existing: ExistingExpenseRecord,
  input: Partial<CreateExpenseInput>,
): CreateExpenseInput {
  const formatDate = (d: Date | string | null | undefined) =>
    d instanceof Date
      ? d.toISOString().slice(0, 10)
      : typeof d === "string"
        ? d.slice(0, 10)
        : String(d);

  const existingLines = (existing.lines || []).map((l) => {
    const allocations = (l.allocations || []).map((a) => {
      const { allocationId, ...restDims } = a.dimensions || {};
      return {
        id: allocationId || a.id || randomUUID(),
        amountMinor: String(a.amount_minor),
        dimensions: restDims as Record<string, string>,
      };
    });
    const line: CreateExpenseInput["lines"][number] = {
      description: l.description,
      netMinor: String(l.netMinor),
      vatMinor: String(l.vatMinor),
      grossMinor: String(l.grossMinor),
      postingAccountCode: l.postingAccountCode,
      ...(l.expenseCategoryCode ? { expenseCategoryCode: l.expenseCategoryCode } : {}),
      dimensions: l.dimensions || {},
      allocations,
      ...(l.vatAccountCode ? { vatAccountCode: l.vatAccountCode } : {}),
      ...(l.managementState ? { managementState: l.managementState } : {}),
      ...(l.citState ? { citState: l.citState } : {}),
      ...(l.vatState ? { vatState: l.vatState } : {}),
      ...(l.citEligibleMinor ? { citEligibleMinor: String(l.citEligibleMinor) } : {}),
      ...(l.vatEligibleMinor ? { vatEligibleMinor: String(l.vatEligibleMinor) } : {}),
    };
    return line;
  });

  const mergedExtRef =
    input.externalReference !== undefined
      ? input.externalReference || undefined
      : existing.externalReference
        ? {
            system: existing.externalReference.system,
            externalId: existing.externalReference.externalId,
            canonicalUrl: existing.externalReference.canonicalUrl || undefined,
            checksum: existing.externalReference.checksum || undefined,
            version: existing.externalReference.version || undefined,
            metadata: existing.externalReference.metadata,
          }
        : undefined;

  const payee = input.payeePartyId !== undefined ? input.payeePartyId : existing.payee_party_id;
  const employee =
    input.employeePartyId !== undefined ? input.employeePartyId : existing.employee_party_id;
  const start =
    input.servicePeriodStart !== undefined
      ? input.servicePeriodStart
      : existing.service_period_start;
  const end =
    input.servicePeriodEnd !== undefined ? input.servicePeriodEnd : existing.service_period_end;
  const checklist =
    input.evidenceChecklist !== undefined ? input.evidenceChecklist : existing.evidence_checklist;
  const paymentEvidence = mergePaymentEvidenceFields(input, existing);

  let cleanedExtRef: ExternalReferenceInput | undefined = undefined;
  if (mergedExtRef) {
    cleanedExtRef = {
      system: mergedExtRef.system,
      externalId: mergedExtRef.externalId,
      ...(mergedExtRef.canonicalUrl ? { canonicalUrl: mergedExtRef.canonicalUrl } : {}),
      ...(mergedExtRef.checksum ? { checksum: mergedExtRef.checksum } : {}),
      ...(mergedExtRef.version ? { version: mergedExtRef.version } : {}),
      ...(mergedExtRef.metadata ? { metadata: mergedExtRef.metadata } : {}),
    };
  }

  return {
    expenseClass: input.expenseClass !== undefined ? input.expenseClass : existing.expense_class,
    expenseDate:
      input.expenseDate !== undefined ? input.expenseDate : formatDate(existing.expense_date),
    businessPurpose:
      input.businessPurpose !== undefined ? input.businessPurpose : existing.business_purpose,
    currency: input.currency !== undefined ? input.currency : existing.currency,
    netMinor: input.netMinor !== undefined ? input.netMinor : String(existing.net_minor),
    vatMinor: input.vatMinor !== undefined ? input.vatMinor : String(existing.vat_minor),
    grossMinor: input.grossMinor !== undefined ? input.grossMinor : String(existing.gross_minor),
    counterAccountCode:
      input.counterAccountCode !== undefined
        ? input.counterAccountCode
        : existing.counter_account_code,
    ...(input.fundingFinancialAccountId !== undefined
      ? { fundingFinancialAccountId: input.fundingFinancialAccountId }
      : existing.funding_financial_account_id
        ? { fundingFinancialAccountId: existing.funding_financial_account_id }
        : {}),
    paymentMethod: paymentEvidence.paymentMethod,
    paidOn: paymentEvidence.paidOn,
    paymentEvidenceRef: paymentEvidence.paymentEvidenceRef,
    transactionEvidence: paymentEvidence.transactionEvidence,
    lines: input.lines !== undefined ? input.lines : existingLines,
    ...(payee ? { payeePartyId: payee } : {}),
    ...(employee ? { employeePartyId: employee } : {}),
    ...(start ? { servicePeriodStart: formatDate(start) } : {}),
    ...(end ? { servicePeriodEnd: formatDate(end) } : {}),
    ...(checklist ? { evidenceChecklist: checklist as Record<string, boolean> } : {}),
    ...(cleanedExtRef ? { externalReference: cleanedExtRef } : {}),
  };
}

export function normalizeExpenseRelationships(input: CreateExpenseInput): CreateExpenseInput {
  const paymentEvidence = mergePaymentEvidenceFields(input);
  return {
    ...input,
    paymentMethod: paymentEvidence.paymentMethod,
    paidOn: paymentEvidence.paidOn,
    paymentEvidenceRef: paymentEvidence.paymentEvidenceRef,
    transactionEvidence: paymentEvidence.transactionEvidence,
    lines: input.lines.map((line) => {
      const lineCategory = line.expenseCategoryCode?.trim() || line.dimensions?.category?.trim();
      const allocationCategories = line.allocations
        .map((allocation) => allocation.dimensions.category?.trim())
        .filter((category): category is string => Boolean(category));
      const categories = [lineCategory, ...allocationCategories].filter(
        (category): category is string => Boolean(category),
      );
      if (new Set(categories).size > 1) throw new Error("CATEGORY_AMBIGUOUS");
      const category = categories[0];
      const lineDimensions = Object.fromEntries(
        Object.entries(line.dimensions ?? {}).filter(([key]) => key !== "category"),
      );
      return {
        ...line,
        ...(category ? { expenseCategoryCode: category } : {}),
        ...(Object.keys(lineDimensions).length ? { dimensions: lineDimensions } : {}),
        allocations: line.allocations.map((allocation) => {
          const allocationDimensions = Object.fromEntries(
            Object.entries(allocation.dimensions).filter(([key]) => key !== "category"),
          );
          return {
            ...allocation,
            dimensions: {
              ...allocationDimensions,
              ...(lineDimensions.projectId && !allocationDimensions.projectId
                ? { projectId: lineDimensions.projectId }
                : {}),
              ...(lineDimensions.contractId && !allocationDimensions.contractId
                ? { contractId: lineDimensions.contractId }
                : {}),
            },
          };
        }),
      };
    }),
  };
}
