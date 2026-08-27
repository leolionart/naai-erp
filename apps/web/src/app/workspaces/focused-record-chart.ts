import type { StackedCategoryPoint } from "@/components/dashboard/monthly-category-stacked-chart";

type Row = Record<string, unknown>;

function text(row: Row | undefined, ...keys: string[]) {
  for (const key of keys) {
    const snake = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    const value = row?.[key] ?? row?.[snake];
    if (value !== undefined && value !== null && value !== "") return String(value);
  }
  return "";
}

function sourceKind(row: Row) {
  const source = row.__sourceKind;
  return source === "expenses" || source === "recognition" ? source : "documents";
}

function fallbackCategory(row: Row) {
  const source = sourceKind(row);
  if (source === "recognition") return "Doanh thu đã ghi nhận";
  if (source === "expenses") return "Chi phí chưa phân loại";
  const type = text(row, "type");
  if (type === "sales_invoice") return "Doanh thu chưa phân loại";
  if (type === "purchase_invoice") return "Chi phí chưa phân loại";
  if (type === "credit_note") return "Giảm trừ hóa đơn";
  return "Chứng từ chưa phân loại";
}

function lineCategory(line: Row) {
  const dimensions = (line.dimensions as Row | undefined) ?? {};
  return (
    text(
      line,
      "category",
      "categoryCode",
      "category_code",
      "expenseCategoryCode",
      "expense_category_code",
      "serviceLineCode",
    ) || text(dimensions, "category", "serviceLineCode", "service_line_code")
  );
}

function allocationCategory(allocation: Row) {
  const dimensions = allocation.dimensions;
  return dimensions && typeof dimensions === "object"
    ? text(dimensions as Row, "category", "categoryCode", "category_code")
    : "";
}

function addRecordLines(
  row: Row,
  lines: Row[],
  categoryName: (code?: string) => string,
  add: (month: string, category: string, amount: bigint) => void,
  month: string,
) {
  const rootCategory = text(
    row,
    "category",
    "categoryCode",
    "category_code",
    "expenseCategoryCode",
  );
  for (const line of lines) {
    const directCategory = lineCategory(line) || rootCategory;
    const allocations = Array.isArray(line.allocations) ? (line.allocations as Row[]) : [];
    const categorizedAllocations = allocations.filter((allocation) =>
      allocationCategory(allocation),
    );
    if (!lineCategory(line) && categorizedAllocations.length) {
      for (const allocation of categorizedAllocations) {
        const code = allocationCategory(allocation);
        const label = categoryName(code) || fallbackCategory(row);
        const amount = BigInt(text(allocation, "amountMinor", "amount_minor") || "0");
        add(month, label, amount);
      }
      continue;
    }
    const label = (directCategory && categoryName(directCategory)) || fallbackCategory(row);
    const amount = BigInt(text(line, "grossMinor", "netMinor", "amountMinor") || "0");
    add(month, label, amount);
  }
}

export function buildFocusedRecordChartPoints(
  rows: readonly Row[],
  categoryName: (code?: string) => string,
): readonly StackedCategoryPoint[] {
  const monthly = new Map<string, Map<string, bigint>>();

  function add(month: string, category: string, amount: bigint) {
    const categories = monthly.get(month) ?? new Map<string, bigint>();
    categories.set(category, (categories.get(category) ?? 0n) + amount);
    monthly.set(month, categories);
  }

  for (const row of rows) {
    const date = text(row, "documentDate", "expenseDate", "effectiveOn", "issueDate", "createdAt");
    const month = date && /^\d{4}-\d{2}/.test(date) ? date.substring(0, 7) : "Khác";
    const lines = Array.isArray(row.lines) ? (row.lines as Row[]) : [];

    if ((sourceKind(row) === "documents" || sourceKind(row) === "expenses") && lines.length) {
      addRecordLines(row, lines, categoryName, add, month);
      continue;
    }
    const code = text(row, "category", "categoryCode", "expenseCategoryCode", "serviceLineCode");
    const label = (code && categoryName(code)) || fallbackCategory(row);
    const amount = BigInt(
      text(row, "grossMinor", "totalAmountMinor", "amountMinor", "totalMinor") || "0",
    );
    add(month, label, amount);
  }

  return [...monthly.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([month, categories]) => ({
      month: month === "Khác" ? month : `Tháng ${month.substring(5)}/${month.substring(0, 4)}`,
      categories: Object.fromEntries(categories),
    }));
}
