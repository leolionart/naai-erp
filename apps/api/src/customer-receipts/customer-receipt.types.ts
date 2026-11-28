import type { RawListQuery } from "@naai-erp/contracts";
import type { CreateCustomerReceiptRequest } from "@naai-erp/contracts";
import type { JournalActorContext } from "../journals/journal.types.js";
export type CustomerReceiptContext = JournalActorContext;
export type CustomerReceiptStore = Readonly<{
  create(
    context: CustomerReceiptContext,
    input: CreateCustomerReceiptRequest,
    key: string,
  ): Promise<unknown>;
  list(
    org: string,
    paging?: RawListQuery,
  ): Promise<{ items: unknown[]; page: unknown; meta: unknown }>;
  get(org: string, id: string): Promise<unknown | undefined>;
}>;
export const CUSTOMER_RECEIPT_STORE = Symbol("CUSTOMER_RECEIPT_STORE");
