type Row = Readonly<Record<string, unknown>>;

function first(row: Row, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && value !== "") return String(value);
  }
  return "";
}

export function presentExpenseRecord(row: Row) {
  const firstLine = Array.isArray(row.lines) ? (row.lines[0] as Row | undefined) : undefined;
  return {
    activityDate: first(row, "expenseDate", "expense_date", "documentDate", "document_date"),
    description:
      first(row, "notes", "note", "businessPurpose", "business_purpose", "reason", "description") ||
      (firstLine ? first(firstLine, "note", "notes", "description") : ""),
    amountMinor: first(row, "grossMinor", "gross_minor", "amountMinor", "amount_minor"),
    payeePartyId: first(row, "payeePartyId", "payee_party_id", "partyId", "party_id"),
    // List APIs may omit the root projection while still returning the
    // canonical category on the first expense line. Prefer the root value,
    // then fall back to line-level camel/snake case aliases so the table and
    // downstream category filters never blank an existing classification.
    category:
      first(row, "category", "expenseCategoryCode", "expense_category_code") ||
      (firstLine
        ? first(firstLine, "expenseCategoryCode", "expense_category_code", "category")
        : ""),
    counterAccountCode: first(
      row,
      "counterAccountCode",
      "counter_account_code",
      "controlAccountCode",
      "control_account_code",
    ),
  } as const;
}
