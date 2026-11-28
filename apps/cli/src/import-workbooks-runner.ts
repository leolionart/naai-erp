import type { NaaiErpClient } from "./client.js";
import { createWorkbookPartyRegistry } from "./import-workbooks-classifications.js";
import { ingestFinanceWorkbook } from "./import-workbooks-finance-controls.js";
import { ingestProjectWorkbook } from "./import-workbooks-projects-sheet.js";
import { finalizeWorkbookReviewRows } from "./import-workbooks-review-rows.js";
import type { ImportedParty, WorkbookImportAccumulator } from "./import-workbooks-types.js";

export async function buildWorkbookImportPayload(
  projectWorkbookPath?: string,
  financeWorkbookPath?: string,
) {
  if (!projectWorkbookPath && !financeWorkbookPath) {
    throw new Error("workbook-import requires --project-workbook and/or --finance-workbook");
  }
  const parties = new Map<string, ImportedParty>();
  const state: WorkbookImportAccumulator = {
    issues: [],
    inventory: [],
    parties,
    projects: [],
    projectsBySourceRow: new Map(),
    salesInvoices: [],
    expenses: [],
    reviewSources: [],
    controlResourceTypes: new Map(),
    controls: [],
    sources: [],
    party: createWorkbookPartyRegistry(parties),
  };

  if (projectWorkbookPath) await ingestProjectWorkbook(projectWorkbookPath, state);
  if (financeWorkbookPath) await ingestFinanceWorkbook(financeWorkbookPath, state);

  const reviewRows = finalizeWorkbookReviewRows(state);

  return {
    mappingVersion: 4,
    sources: state.sources,
    inventory: state.inventory,
    issues: state.issues,
    controls: state.controls,
    varianceRules: [],
    parties: [...state.parties.values()],
    projects: state.projects,
    salesInvoices: state.salesInvoices,
    expenses: state.expenses,
    reviewRows,
  };
}

export async function runWorkbookImport(
  client: NaaiErpClient,
  projectWorkbookPath: string | undefined,
  financeWorkbookPath: string | undefined,
  commit: boolean,
): Promise<unknown> {
  const payload = await buildWorkbookImportPayload(projectWorkbookPath, financeWorkbookPath);
  return client.request("workbook-imports", commit ? "commit" : "dry-run", payload);
}
