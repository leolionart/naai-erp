type MigrationExpense = Readonly<Record<string, unknown>>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY = /^[A-Z]{3}$/;

export function workbookExpenseMigrationErrors(expenses: readonly MigrationExpense[]) {
  const errors: string[] = [];
  for (const expense of expenses) {
    const row = String(expense.sourceRowIndex ?? "unknown");
    let gross: bigint;
    let tax: bigint;
    try {
      gross = BigInt(String(expense.amountMinor));
      tax = BigInt(String(expense.taxMinor));
    } catch {
      errors.push(`row ${row}: amountMinor and taxMinor must be integer strings`);
      continue;
    }
    if (gross === 0n) continue;
    if (gross < 0n || tax < 0n || tax >= gross) errors.push(`row ${row}: require gross > tax >= 0`);
    if (!String(expense.id ?? "").trim()) errors.push(`row ${row}: missing source expense id`);
    if (!String(expense.payeePartyId ?? "").trim()) errors.push(`row ${row}: missing payeePartyId`);
    if (!ISO_DATE.test(String(expense.date ?? ""))) errors.push(`row ${row}: invalid expense date`);
    if (!CURRENCY.test(String(expense.currency ?? ""))) errors.push(`row ${row}: invalid currency`);
    if (!String(expense.businessPurpose ?? "").trim())
      errors.push(`row ${row}: missing businessPurpose`);
  }
  return errors;
}
