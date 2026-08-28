type Row = Readonly<Record<string, unknown>>;

function first(row: Row | undefined, ...keys: string[]) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && value !== "") return String(value).trim();
  }
  return "";
}

/** Canonical list/detail presentation contract: root projection, then canonical line data. */
export function recordCategory(row: Row): string {
  const root = first(row, "category", "categoryCode", "category_code");
  if (root) return root;
  if (!Array.isArray(row.lines)) return "";
  for (const line of row.lines as Row[]) {
    const lineCategory = first(
      line,
      "category",
      "categoryCode",
      "category_code",
      "expenseCategoryCode",
      "expense_category_code",
    );
    if (lineCategory) return lineCategory;
    const dimensions = line.dimensions;
    if (dimensions && typeof dimensions === "object") {
      const dimensionCategory = first(
        dimensions as Row,
        "category",
        "categoryCode",
        "category_code",
      );
      if (dimensionCategory) return dimensionCategory;
    }
    if (Array.isArray(line.allocations)) {
      for (const allocation of line.allocations as (Row | null | undefined)[]) {
        if (!allocation) continue;
        const allocationDimensions = allocation.dimensions;
        if (allocationDimensions && typeof allocationDimensions === "object") {
          const allocationCategory = first(
            allocationDimensions as Row,
            "category",
            "categoryCode",
            "category_code",
          );
          if (allocationCategory) return allocationCategory;
        }
      }
    }
  }
  return "";
}
