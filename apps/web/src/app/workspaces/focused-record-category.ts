type Row = Readonly<Record<string, unknown>>;

/** Canonical list/detail presentation contract: category is a root projection. */
export function recordCategory(row: Row): string {
  const value = row.category;
  return value === undefined || value === null ? "" : String(value).trim();
}
