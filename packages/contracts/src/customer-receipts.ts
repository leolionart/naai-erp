import type { MutationMetadata } from "./index.js";
export const CUSTOMER_RECEIPT_CONTRACT_VERSION = 1 as const;
export type CustomerReceiptAllocationRequest = Readonly<{
  salesInvoiceId: string;
  amountMinor: string;
}>;
export type CreateCustomerReceiptRequest = Readonly<{
  schemaVersion: 1;
  id?: string;
  financialAccountId: string;
  receiptDate: string;
  amountMinor: string;
  currency: string;
  description: string;
  reason: string;
  allocations: readonly CustomerReceiptAllocationRequest[];
}>;
export type CustomerReceiptAllocationContract = Readonly<{
  id: string;
  salesInvoiceId: string;
  amountMinor: string;
  invoiceState: "partially_paid" | "paid";
  invoiceOutstandingMinor: string;
}>;
export type CustomerReceiptContract = Readonly<{
  schemaVersion: 1;
  id: string;
  financialAccountId: string;
  receiptDate: string;
  amountMinor: string;
  currency: string;
  description: string;
  state: "posted";
  journalId: string;
  customerId: string;
  allocations: readonly CustomerReceiptAllocationContract[];
  resourceVersion: string;
}> &
  MutationMetadata;
