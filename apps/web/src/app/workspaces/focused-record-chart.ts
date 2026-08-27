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
    text(line, "category", "categoryCode", "expenseCategoryCode", "serviceLineCode") ||
    text(dimensions, "category", "serviceLineCode", "service_line_code")
  );
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

    if (sourceKind(row) === "documents" && lines.length) {
      for (const line of lines) {
        const code = lineCategory(line);
        const label = (code && categoryName(code)) || fallbackCategory(row);
        const amount = BigInt(text(line, "grossMinor", "netMinor", "amountMinor") || "0");
        add(month, label, amount);
      }
      continue;
    }

    if (sourceKind(row) === "expenses" && lines.length) {
      for (const line of lines) {
        const code = lineCategory(line);
        const label = (code && categoryName(code)) || fallbackCategory(row);
        const amount = BigInt(text(line, "grossMinor", "netMinor", "amountMinor") || "0");
        add(month, label, amount);
      }
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
