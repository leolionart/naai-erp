import type {
  PaymentEvidenceGapItemContract,
  PaymentEvidenceGapsReportContract,
  PaymentEvidenceInputContract,
} from "@naai-erp/contracts";
import type { JournalActorContext } from "../journals/journal.types.js";

export type PaymentEvidenceContext = JournalActorContext;

export type UpdatePaymentEvidenceInput = PaymentEvidenceInputContract &
  Readonly<{
    payment_method?: PaymentEvidenceInputContract["paymentMethod"] | undefined;
    paid_on?: string | null | undefined;
    payment_evidence_ref?: string | null | undefined;
    transaction_evidence?: PaymentEvidenceInputContract["transactionEvidence"] | undefined;
  }>;

export type PaymentEvidenceGapsQuery = Readonly<{
  startsOn?: string;
  endsOn?: string;
}>;

export type PaymentEvidenceGapItem = PaymentEvidenceGapItemContract;
export type PaymentEvidenceGapsReport = PaymentEvidenceGapsReportContract;
