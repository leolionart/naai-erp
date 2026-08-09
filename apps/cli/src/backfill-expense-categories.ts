import { parseArgs } from "node:util";
import {
  buildWorkbookImportPayload,
  declaredExpenseCategory,
  inferExpenseCategory,
} from "./import-workbooks.js";

type Row = Record<string, unknown>;
type Envelope = { data?: Row; error?: unknown };

const { values } = parseArgs({
  options: {
    commit: { type: "boolean", default: false },
    organization: { type: "string", default: process.env.NAAI_ERP_ORGANIZATION ?? "naai" },
    "base-url": {
      type: "string",
      default: process.env.NAAI_ERP_BASE_URL ?? "http://localhost:3001",
    },
    "project-workbook": { type: "string" },
    "finance-workbook": { type: "string" },
  },
});

const projectWorkbook = values["project-workbook"] ?? process.env.ERP740_PROJECT_WORKBOOK;
const financeWorkbook = values["finance-workbook"] ?? process.env.ERP740_FINANCE_WORKBOOK;
const token = process.env.NAAI_ERP_TOKEN;
if (!projectWorkbook || !financeWorkbook) throw new Error("both workbook paths are required");
if (values.commit && !token) throw new Error("commit requires NAAI_ERP_TOKEN");

const base = `${values["base-url"]}/api/v1/organizations/${encodeURIComponent(values.organization)}`;
const auth = token ? { authorization: `Bearer ${token.replace(/^Bearer\s+/i, "")}` } : {};
const request = async (path: string, init: RequestInit = {}, key?: string) => {
  const response = await fetch(`${base}/${path}`, {
    ...init,
    headers: {
      ...auth,
      accept: "application/json",
      "content-type": "application/json",
      "x-correlation-id": "expense-category-backfill-v1",
      ...(key ? { "idempotency-key": key } : {}),
      ...init.headers,
    },
  });
  const body = (await response.json()) as Envelope;
  if (!response.ok) throw new Error(`${path}: ${JSON.stringify(body.error ?? body)}`);
  return body.data ?? {};
};
const items = (value: Row) => (Array.isArray(value.items) ? (value.items as Row[]) : []);
const text = (row: Row, ...keys: string[]) => {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && value !== "") return String(value);
  }
  return "";
};

const payload = await buildWorkbookImportPayload(projectWorkbook, financeWorkbook);
const expenseByRow = new Map(
  payload.expenses.map((expense) => [Number(expense.sourceRowIndex), expense] as const),
);
const expenseRows = items(await request("expenses?limit=500"));
const documentRows = items(await request("commercial-documents?type=purchase_invoice&limit=500"));

const assignments: {
  resource: "expenses" | "commercial-documents";
  id: string;
  code: string;
  label: string;
}[] = [];
for (const row of expenseRows) {
  const id = text(row, "id");
  const sourceRow = Number(id.match(/^expense-expense-(\d+)-/)?.[1] ?? 0);
  const source = expenseByRow.get(sourceRow);
  if (source) {
    assignments.push({
      resource: "expenses",
      id,
      code: String(source.categoryCode),
      label: String(source.categoryLabel),
    });
  } else {
    const description = text(row, "business_purpose", "businessPurpose");
    const inferred = inferExpenseCategory(description, description);
    const category = declaredExpenseCategory(inferred);
    assignments.push({ resource: "expenses", id, code: category.code, label: category.label });
  }
}
for (const row of documentRows) {
  const id = text(row, "id");
  const lines = Array.isArray(row.lines) ? (row.lines as Row[]) : [];
  const description = lines
    .map((line) => text(line, "description"))
    .filter(Boolean)
    .join(" | ");
  const inferred = inferExpenseCategory(description, description);
  const category = declaredExpenseCategory(inferred);
  assignments.push({
    resource: "commercial-documents",
    id,
    code: category.code,
    label: category.label,
  });
}

const distribution = assignments.reduce<Record<string, number>>((result, assignment) => {
  result[assignment.code] = (result[assignment.code] ?? 0) + 1;
  return result;
}, {});
if (!values.commit) {
  console.log(
    JSON.stringify({ mode: "dry-run", assignments: assignments.length, distribution }, null, 2),
  );
  process.exit(0);
}

const categories = new Map(assignments.map((assignment) => [assignment.code, assignment.label]));
const existingDimensions = items(await request("master-data/dimensions?limit=500"));
const existingExpenseCategories = items(await request("master-data/expense-categories?limit=500"));
const dimensionCodes = new Set(
  existingDimensions
    .filter((row) => text(row, "kind") === "category")
    .map((row) => text(row, "code")),
);
const expenseCategoryCodes = new Set(existingExpenseCategories.map((row) => text(row, "code")));

for (const [code, name] of categories) {
  if (!dimensionCodes.has(code))
    await request(
      "master-data/dimensions",
      {
        method: "POST",
        body: JSON.stringify({ data: { kind: "category", code, name, is_active: true } }),
      },
      `expense-category-dimension-v1:${code}`,
    );
  if (!expenseCategoryCodes.has(code))
    await request(
      "master-data/expense-categories",
      {
        method: "POST",
        body: JSON.stringify({
          data: { code, name, funding_treatment: "company_funds", is_active: true },
        }),
      },
      `expense-category-master-v1:${code}`,
    );
}

for (const assignment of assignments) {
  await request(
    `${assignment.resource}/${encodeURIComponent(assignment.id)}/category`,
    { method: "PATCH", body: JSON.stringify({ category: assignment.code }) },
    `expense-category-backfill-v1:${assignment.resource}:${assignment.id}:${assignment.code}`,
  );
}

const expenseReadback = items(await request("expenses?limit=500"));
const documentReadback = items(
  await request("commercial-documents?type=purchase_invoice&limit=500"),
);
const categorizedExpenses = expenseReadback.filter((row) => text(row, "category")).length;
const categorizedDocumentLines = documentReadback
  .flatMap((row) => (Array.isArray(row.lines) ? (row.lines as Row[]) : []))
  .filter((line) => text((line.dimensions as Row | undefined) ?? {}, "category")).length;
console.log(
  JSON.stringify(
    {
      mode: "commit",
      assignments: assignments.length,
      categoriesCreatedOrReused: categories.size,
      categorizedExpenses,
      categorizedDocumentLines,
    },
    null,
    2,
  ),
);
