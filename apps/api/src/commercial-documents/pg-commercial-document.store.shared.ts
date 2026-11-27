import type { CommercialDocumentType } from "./commercial-document.types.js";

export type StoredDocument = {
  id: string;
  type: CommercialDocumentType;
  state: string;
  document_date: string;
  currency: string;
  party_id: string;
  document_number: string;
  net_minor: string;
  tax_minor: string;
  gross_minor: string;
  control_account_code: string;
  funding_financial_account_id: string | null;
  original_document_id: string | null;
  created_by: string;
  version: string;
};

export const NEXT: Record<CommercialDocumentType, Record<string, Record<string, string>>> = {
  sales_invoice: {
    draft: { validate: "validated", cancel: "cancelled" },
    validated: { issue: "issued", cancel: "cancelled" },
  },
  purchase_invoice: {
    draft: { capture: "captured", cancel: "cancelled" },
    captured: { verify: "verified", cancel: "cancelled" },
    verified: { approve: "approved", cancel: "cancelled" },
    approved: { post: "posted" },
  },
  credit_note: {
    draft: { validate: "validated", cancel: "cancelled" },
    validated: { issue: "issued", cancel: "cancelled" },
  },
};
