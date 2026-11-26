import { randomUUID } from "node:crypto";
import { mergePaymentEvidenceFields } from "../payment-evidence/payment-input.helper.js";
import type {
  CommercialDocumentLineInput,
  CreateCommercialDocumentInput,
  DocumentAllocationInput,
  ExternalReferenceInput,
  UpdateCommercialDocumentInput,
} from "./commercial-document.types.js";

export interface ExistingCommercialDocument {
  type: string;
  document_number: string;
  series: string | null;
  fiscal_year: number;
  party_id: string;
  document_date: Date | string;
  due_date: Date | string;
  currency: string;
  net_minor: string | number;
  tax_minor: string | number;
  gross_minor: string | number;
  control_account_code: string;
  funding_financial_account_id: string | null;
  payment_method?: string | null;
  paymentMethod?: string | null;
  paid_on?: Date | string | null;
  paidOn?: Date | string | null;
  payment_evidence_ref?: string | null;
  paymentEvidenceRef?: string | null;
  transaction_evidence?: string | null;
  transactionEvidence?: string | null;
  original_document_id: string | null;
  reason: string | null;
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
    originalLineNumber?: number;
    description: string;
    quantity: string | number;
    unitPriceMinor: string | number;
    netMinor: string | number;
    taxMinor: string | number;
    grossMinor: string | number;
    primaryAccountCode: string;
    categoryCode?: string;
    taxAccountCode?: string;
    taxCode?: string;
    dimensions?: Record<string, string>;
    allocations: Array<{
      id?: string;
      amount_minor: string | number;
      dimensions?: Record<string, string>;
    }>;
  }>;
}

export function mergeCommercialDocumentInput(
  existing: ExistingCommercialDocument,
  input: UpdateCommercialDocumentInput,
): CreateCommercialDocumentInput {
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
    const originalLineVal = l.lineNumber || l.originalLineNumber;
    const line: CreateCommercialDocumentInput["lines"][number] = {
      description: l.description,
      quantity: String(l.quantity),
      unitPriceMinor: String(l.unitPriceMinor),
      netMinor: String(l.netMinor),
      taxMinor: String(l.taxMinor),
      grossMinor: String(l.grossMinor),
      primaryAccountCode: l.primaryAccountCode,
      dimensions: {
        ...(l.dimensions || {}),
        ...(l.categoryCode ? { category: l.categoryCode } : {}),
      },
      allocations,
      ...(typeof originalLineVal === "number" ? { originalLineNumber: originalLineVal } : {}),
      ...(l.taxAccountCode ? { taxAccountCode: l.taxAccountCode } : {}),
      ...(l.taxCode ? { taxCode: l.taxCode } : {}),
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

  const seriesVal = input.series !== undefined ? input.series : existing.series;
  const origId =
    input.originalDocumentId !== undefined
      ? input.originalDocumentId
      : existing.original_document_id;
  const reasonVal = input.reason !== undefined ? input.reason : existing.reason;
  const paymentEvidence = mergePaymentEvidenceFields(input, existing);

  const fundingAccountId = input.funding
    ? input.funding.type === "owner_paid"
      ? undefined
      : input.funding.financialAccountId
    : (input.fundingSource?.financialAccountId ??
      existing.funding_financial_account_id ??
      undefined);

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
    type: (input.type !== undefined
      ? input.type
      : existing.type) as CreateCommercialDocumentInput["type"],
    documentNumber:
      input.documentNumber !== undefined ? input.documentNumber : existing.document_number,
    fiscalYear: input.fiscalYear !== undefined ? input.fiscalYear : existing.fiscal_year,
    partyId: input.partyId !== undefined ? input.partyId : existing.party_id,
    documentDate:
      input.documentDate !== undefined ? input.documentDate : formatDate(existing.document_date),
    dueDate: input.dueDate !== undefined ? input.dueDate : formatDate(existing.due_date),
    currency: input.currency !== undefined ? input.currency : existing.currency,
    netMinor: input.netMinor !== undefined ? input.netMinor : String(existing.net_minor),
    taxMinor: input.taxMinor !== undefined ? input.taxMinor : String(existing.tax_minor),
    grossMinor: input.grossMinor !== undefined ? input.grossMinor : String(existing.gross_minor),
    controlAccountCode:
      input.controlAccountCode !== undefined
        ? input.controlAccountCode
        : existing.control_account_code,
    ...(fundingAccountId
      ? {
          fundingSource: {
            type: "financial_account" as const,
            financialAccountId: fundingAccountId,
          },
        }
      : {}),
    paymentMethod: paymentEvidence.paymentMethod,
    paidOn: paymentEvidence.paidOn,
    paymentEvidenceRef: paymentEvidence.paymentEvidenceRef,
    transactionEvidence: paymentEvidence.transactionEvidence,
    lines: input.lines !== undefined ? input.lines : existingLines,
    ...(seriesVal ? { series: seriesVal } : {}),
    ...(origId ? { originalDocumentId: origId } : {}),
    ...(reasonVal ? { reason: reasonVal } : {}),
    ...(cleanedExtRef ? { externalReference: cleanedExtRef } : {}),
  };
}

export function normalizeDocumentRelationships(
  input: CreateCommercialDocumentInput,
): CreateCommercialDocumentInput {
  const paymentEvidence = mergePaymentEvidenceFields(input);
  return {
    ...input,
    paymentMethod: paymentEvidence.paymentMethod,
    paidOn: paymentEvidence.paidOn,
    paymentEvidenceRef: paymentEvidence.paymentEvidenceRef,
    transactionEvidence: paymentEvidence.transactionEvidence,
    lines: (Array.isArray(input?.lines) ? input.lines : []).map(
      (line: CommercialDocumentLineInput) => {
        const lineCategory = line.categoryCode?.trim() || line.dimensions?.category?.trim();
        const allocationCategories = line.allocations
          .map((allocation) => allocation.dimensions.category?.trim())
          .filter((category): category is string => Boolean(category));
        const categories = [lineCategory, ...allocationCategories].filter(
          (category): category is string => Boolean(category),
        );
        if (new Set(categories).size > 1) throw new Error("CATEGORY_AMBIGUOUS");
        const dimensions = Object.fromEntries(
          Object.entries(line.dimensions ?? {}).filter(([key]) => key !== "category"),
        );
        const categoryCode = categories[0];
        return {
          ...line,
          ...(categoryCode ? { categoryCode } : {}),
          ...(Object.keys(dimensions).length ? { dimensions } : {}),
          allocations: (Array.isArray(line.allocations) ? line.allocations : []).map(
            (allocation: DocumentAllocationInput) => {
              const allocationDimensions = Object.fromEntries(
                Object.entries(allocation.dimensions ?? {}).filter(([key]) => key !== "category"),
              );
              return {
                ...allocation,
                dimensions: {
                  ...allocationDimensions,
                  ...(dimensions.projectId && !allocationDimensions.projectId
                    ? { projectId: dimensions.projectId }
                    : {}),
                  ...(dimensions.contractId && !allocationDimensions.contractId
                    ? { contractId: dimensions.contractId }
                    : {}),
                },
              };
            },
          ),
        };
      },
    ),
  };
}

export function purchaseLineTaxDecision(
  input: CreateCommercialDocumentInput,
  line: CreateCommercialDocumentInput["lines"][number],
  operatingMode: string | null,
) {
  if (input.type !== "purchase_invoice")
    return {
      managementState: "unreviewed",
      citState: "unreviewed",
      vatState: "unreviewed",
      citEligibleMinor: "0",
      vatEligibleMinor: "0",
      reviewed: false,
    };

  const explicit = line.allocations.some(
    (allocation) =>
      allocation.dimensions.taxState !== undefined &&
      allocation.dimensions.taxState !== "unreviewed",
  );
  let vatEligible = 0n;
  if (explicit && BigInt(line.taxMinor) > 0n) {
    let allocatedTax = 0n;
    for (const [index, allocation] of line.allocations.entries()) {
      const tax =
        index === line.allocations.length - 1
          ? BigInt(line.taxMinor) - allocatedTax
          : (BigInt(line.taxMinor) * BigInt(allocation.amountMinor)) / BigInt(line.netMinor);
      allocatedTax += tax;
      const state = allocation.dimensions.taxState;
      if (["eligible", "accountant_override"].includes(state ?? "")) vatEligible += tax;
      else if (state === "partially_eligible") {
        const requested = BigInt(allocation.dimensions.vatEligibleMinor ?? "0");
        vatEligible += requested > tax ? tax : requested;
      }
    }
  }

  const vatMinor = BigInt(line.taxMinor);
  const vatState =
    vatMinor === 0n || vatEligible === 0n
      ? "ineligible"
      : vatEligible === vatMinor
        ? "eligible"
        : "partially_eligible";
  return {
    managementState: operatingMode === "solopreneur" ? "valid" : "unreviewed",
    citState: "unreviewed",
    vatState: explicit ? vatState : "unreviewed",
    citEligibleMinor: "0",
    vatEligibleMinor: explicit ? vatEligible.toString() : "0",
    reviewed: explicit,
  };
}
