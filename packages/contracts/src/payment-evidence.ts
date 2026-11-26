export const PAYMENT_EVIDENCE_CONTRACT_VERSION = 1 as const;

export type PaymentMethodContract = "cash" | "bank_transfer" | "card" | "other" | "unpaid";

export type TransactionEvidenceContract =
  "contract" | "purchase_order" | "email" | "acceptance" | "quote" | "none";

export type PaymentEvidenceInputContract = Readonly<{
  paymentMethod?: PaymentMethodContract | undefined;
  paidOn?: string | null | undefined;
  paymentEvidenceRef?: string | null | undefined;
  transactionEvidence?: TransactionEvidenceContract | undefined;
  reason?: string | undefined;
}>;

export type PaymentEvidenceGapReasonContract =
  | "non_cash_payment_required"
  | "same_day_supplier_vat_threshold"
  | "owner_paid_evidence_ref_missing"
  | "unpaid_pending_settlement"
  | "transaction_evidence_missing";

export type PaymentEvidenceGapItemContract = Readonly<{
  id: string;
  sourceType: "expense" | "purchase_invoice";
  sourceId: string;
  lineNumber: number;
  date: string;
  partyId: string | null;
  partyName: string | null;
  documentNumber: string | null;
  description: string;
  currency: string;
  grossMinor: string;
  sameDaySupplierGrossMinor: string;
  lineNetMinor: string;
  lineVatMinor: string;
  withheldCitMinor: string;
  withheldVatMinor: string;
  citState: string;
  vatState: string;
  paymentMethod: PaymentMethodContract;
  paidOn: string | null;
  paymentEvidenceRef: string | null;
  transactionEvidence: TransactionEvidenceContract;
  isOwnerPaid: boolean;
  gapReasons: readonly PaymentEvidenceGapReasonContract[];
  nextActions: readonly ("update-payment-evidence" | "view-source")[];
}>;

export type PaymentEvidenceGapsReportContract = Readonly<{
  schemaVersion: typeof PAYMENT_EVIDENCE_CONTRACT_VERSION;
  organizationId: string;
  currency: string;
  startsOn: string;
  endsOn: string;
  nonCashThresholdMinor: string;
  status: "ready" | "warning";
  counts: Readonly<{
    recordCount: number;
    lineCount: number;
  }>;
  totals: Readonly<{
    grossMinor: string;
    withheldCitMinor: string;
    withheldVatMinor: string;
  }>;
  items: readonly PaymentEvidenceGapItemContract[];
}>;
