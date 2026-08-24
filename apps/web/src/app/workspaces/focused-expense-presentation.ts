type Row = Readonly<Record<string, unknown>>;

function first(row: Row, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && value !== "") return String(value);
  }
  return "";
}

export function presentExpenseRecord(row: Row) {
  return {
    activityDate: first(row, "expenseDate", "expense_date", "documentDate", "document_date"),
    description: first(row, "businessPurpose", "business_purpose", "reason", "description"),
    amountMinor: first(row, "grossMinor", "gross_minor", "amountMinor", "amount_minor"),
    payeePartyId: first(row, "payeePartyId", "payee_party_id", "partyId", "party_id"),
    category: first(row, "category", "expenseCategoryCode", "expense_category_code"),
    counterAccountCode: first(
      row,
      "counterAccountCode",
      "counter_account_code",
      "controlAccountCode",
      "control_account_code",
    ),
  } as const;
}
