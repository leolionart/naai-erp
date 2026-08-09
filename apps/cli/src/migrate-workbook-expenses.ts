import { parseArgs } from "node:util";
import { buildWorkbookImportPayload } from "./import-workbooks.js";
import { workbookExpenseMigrationErrors } from "./workbook-expense-migration.js";

type Envelope = { data?: Record<string, unknown>; error?: unknown };

const { values } = parseArgs({
  options: {
    commit: { type: "boolean", default: false },
    organization: { type: "string" },
    "base-url": {
      type: "string",
      default: process.env.NAAI_ERP_BASE_URL ?? "http://localhost:3001",
    },
    "project-workbook": { type: "string" },
    "finance-workbook": { type: "string" },
  },
});

const organizationId = values.organization ?? process.env.NAAI_ERP_ORGANIZATION;
const projectWorkbook = values["project-workbook"] ?? process.env.ERP740_PROJECT_WORKBOOK;
const financeWorkbook = values["finance-workbook"] ?? process.env.ERP740_FINANCE_WORKBOOK;
const makerToken = process.env.NAAI_ERP_MIGRATION_MAKER_TOKEN;
const checkerToken = process.env.NAAI_ERP_MIGRATION_CHECKER_TOKEN;
const financeToken = process.env.NAAI_ERP_MIGRATION_FINANCE_TOKEN;

if (!organizationId || !projectWorkbook || !financeWorkbook)
  throw new Error("organization and both workbook paths are required");
if (values.commit && (!makerToken || !checkerToken || !financeToken))
  throw new Error("commit requires maker, checker and finance tokens in environment variables");

const base = `${values["base-url"]}/api/v1/organizations/${encodeURIComponent(organizationId)}`;
const invoiceDate = (raw: string, fallback: string) => {
  const value = raw.trim();
  const iso = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1]!;
  const vietnamese = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (vietnamese)
    return `${vietnamese[3]}-${vietnamese[2]!.padStart(2, "0")}-${vietnamese[1]!.padStart(2, "0")}`;
  return fallback;
};
const request = async (
  path: string,
  token: string,
  init: RequestInit = {},
  idempotencyKey?: string,
) => {
  const response = await fetch(`${base}/${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token.replace(/^Bearer\s+/i, "")}`,
      accept: "application/json",
      "content-type": "application/json",
      "x-correlation-id": `workbook-expense-migration:${path}`,
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
      ...init.headers,
    },
  });
  const body = (await response.json()) as Envelope;
  if (!response.ok) throw new Error(`${path}: ${JSON.stringify(body)}`);
  return body.data ?? {};
};

const payload = await buildWorkbookImportPayload(projectWorkbook, financeWorkbook);
const preflightErrors = workbookExpenseMigrationErrors(payload.expenses);
if (preflightErrors.length)
  throw new Error(`workbook expense migration preflight failed:\n${preflightErrors.join("\n")}`);
const nonZero = payload.expenses.filter((expense) => BigInt(String(expense.amountMinor)) > 0n);
const zero = payload.expenses.filter((expense) => BigInt(String(expense.amountMinor)) === 0n);
const fileCounts = new Map<string, number>();
for (const expense of nonZero) {
  const file = String(expense.sourceMetadata?.invoiceFile ?? "").trim();
  if (file) fileCounts.set(file, (fileCounts.get(file) ?? 0) + 1);
}

if (!values.commit) {
  console.log(
    JSON.stringify(
      { mode: "dry-run", purchaseInvoices: nonZero.length, zeroRowsSkipped: zero.length },
      null,
      2,
    ),
  );
  process.exit(0);
}

let completed = 0;
for (const expense of nonZero) {
  const sourceId = String(expense.id);
  const row = Number(expense.sourceRowIndex);
  const documentId = `purchase-${sourceId}`;
  const existingExpense = await request(`expenses/${encodeURIComponent(sourceId)}`, makerToken!, {
    method: "GET",
  });
  const journalId = String(existingExpense.journal_id ?? existingExpense.journalId ?? "");
  if (!journalId) throw new Error(`source expense ${sourceId} has no posted journal`);
  const gross = BigInt(String(expense.amountMinor));
  const tax = BigInt(String(expense.taxMinor));
  const net = gross - tax;
  const invoiceFile = String(expense.sourceMetadata?.invoiceFile ?? "").trim();
  const uniquePaperless = invoiceFile && fileCounts.get(invoiceFile) === 1;
  const actualInvoiceDate = invoiceDate(
    String(expense.sourceMetadata?.invoiceDate ?? ""),
    expense.date,
  );
  const document = {
    id: documentId,
    type: "purchase_invoice",
    documentNumber: `WB-CP-${String(row).padStart(4, "0")}`,
    fiscalYear: Number(actualInvoiceDate.slice(0, 4)),
    partyId: expense.payeePartyId,
    documentDate: actualInvoiceDate,
    dueDate: actualInvoiceDate,
    currency: expense.currency,
    netMinor: net.toString(),
    taxMinor: tax.toString(),
    grossMinor: gross.toString(),
    controlAccountCode: "331",
    migrationSourceExpenseId: sourceId,
    migrationSourceExpenseDate: expense.date,
    lines: [
      {
        description: expense.businessPurpose,
        quantity: "1",
        unitPriceMinor: net.toString(),
        netMinor: net.toString(),
        taxMinor: tax.toString(),
        grossMinor: gross.toString(),
        primaryAccountCode: "642",
        dimensions: { category: expense.categoryCode },
        ...(tax > 0n ? { taxAccountCode: "1331" } : {}),
        allocations: [
          {
            id: `workbook-expense-${row}`,
            amountMinor: net.toString(),
            dimensions: {
              taxState: "ineligible",
              fundingSource: String(expense.sourceMetadata?.fundingSource ?? "pending"),
              ...(expense.projectId ? { projectId: expense.projectId } : {}),
            },
          },
        ],
      },
    ],
    ...(uniquePaperless
      ? {
          externalReference: {
            system: "paperless",
            externalId: invoiceFile,
            canonicalUrl: invoiceFile,
            metadata: {
              migrationSourceExpenseId: sourceId,
              workbookSheet: "Chi phí",
              workbookRow: row,
              sourceInvoiceDate: expense.sourceMetadata?.invoiceDate || null,
              fundingSource: expense.sourceMetadata?.fundingSource || null,
            },
          },
        }
      : {}),
  };
  await request(
    "commercial-documents",
    makerToken!,
    { method: "POST", body: JSON.stringify(document) },
    `wb-pi-create:${sourceId}`,
  );
  for (const [action, token] of [
    ["capture", makerToken!],
    ["verify", makerToken!],
    ["approve", checkerToken!],
  ] as const)
    await request(
      `commercial-documents/${encodeURIComponent(documentId)}/${action}`,
      token,
      { method: "POST", body: JSON.stringify({ reason: `Workbook expense migration row ${row}` }) },
      `wb-pi-${action}:${sourceId}`,
    );
  await request(
    `journals/${encodeURIComponent(journalId)}/reverse`,
    financeToken!,
    {
      method: "POST",
      body: JSON.stringify({
        reason: `Replaced by purchase invoice ${documentId}`,
        reversalDate: expense.date,
        reversalJournalId: `reversal-${journalId}`,
      }),
    },
    `wb-expense-reverse:${sourceId}`,
  );
  await request(
    `commercial-documents/${encodeURIComponent(documentId)}/post`,
    financeToken!,
    { method: "POST", body: JSON.stringify({ reason: `Replace legacy expense ${sourceId}` }) },
    `wb-pi-post:${sourceId}`,
  );
  completed += 1;
}

console.log(
  JSON.stringify(
    { mode: "commit", purchaseInvoicesPosted: completed, zeroRowsSkipped: zero.length },
    null,
    2,
  ),
);
