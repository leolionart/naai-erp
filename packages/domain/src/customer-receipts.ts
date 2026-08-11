export type CustomerReceiptAllocationInput = Readonly<{
  salesInvoiceId: string;
  amountMinor: string;
}>;

export function validateCustomerReceipt(input: {
  amountMinor: string;
  allocations: readonly CustomerReceiptAllocationInput[];
}) {
  if (!/^\d+$/.test(input.amountMinor) || BigInt(input.amountMinor) <= 0n)
    throw new Error("CUSTOMER_RECEIPT_AMOUNT_INVALID");
  if (input.allocations.length === 0) throw new Error("CUSTOMER_RECEIPT_ALLOCATIONS_REQUIRED");
  const ids = new Set<string>();
  let allocated = 0n;
  for (const allocation of input.allocations) {
    if (!allocation.salesInvoiceId.trim() || ids.has(allocation.salesInvoiceId))
      throw new Error("CUSTOMER_RECEIPT_ALLOCATION_INVALID");
    if (!/^\d+$/.test(allocation.amountMinor) || BigInt(allocation.amountMinor) <= 0n)
      throw new Error("CUSTOMER_RECEIPT_ALLOCATION_INVALID");
    ids.add(allocation.salesInvoiceId);
    allocated += BigInt(allocation.amountMinor);
  }
  if (allocated !== BigInt(input.amountMinor))
    throw new Error("CUSTOMER_RECEIPT_ALLOCATION_MISMATCH");
  return { amountMinor: BigInt(input.amountMinor), allocatedMinor: allocated };
}
