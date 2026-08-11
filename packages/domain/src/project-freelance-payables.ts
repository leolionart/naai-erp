export function validateFreelancePayable(input: {
  expenseDate: string;
  dueDate: string;
  amountMinor: string;
}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.expenseDate) || !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate))
    throw new Error("FREELANCE_PAYABLE_DATE_INVALID");
  if (input.dueDate < input.expenseDate) throw new Error("FREELANCE_PAYABLE_DUE_DATE_INVALID");
  if (!/^[1-9]\d*$/.test(input.amountMinor)) throw new Error("FREELANCE_PAYABLE_AMOUNT_INVALID");
  return { amountMinor: BigInt(input.amountMinor) };
}
export function validateFreelancePayment(amountMinor: string, outstandingMinor: bigint) {
  if (!/^[1-9]\d*$/.test(amountMinor)) throw new Error("FREELANCE_PAYMENT_AMOUNT_INVALID");
  const amount = BigInt(amountMinor);
  if (amount > outstandingMinor) throw new Error("FREELANCE_PAYMENT_OVER_ALLOCATION");
  return amount;
}
