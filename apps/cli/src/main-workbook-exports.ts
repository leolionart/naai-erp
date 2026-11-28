import { runWorkbookImport } from "./import-workbooks.js";
import type { CliValues } from "./main-cli-options.js";
import { writeDownloadedWorkbookOutput } from "./payment-evidence-cli.js";
import type { NaaiErpReadClient } from "./read-client.js";

export async function tryRunWorkbookExportsCommand(
  client: NaaiErpReadClient,
  resource: string,
  action: string,
  values: CliValues,
): Promise<boolean> {
  if (resource === "management-workbook") {
    if (!["export", "download"].includes(action) || !values.output || !values.from || !values.to)
      throw new Error("management-workbook download requires --from, --to, and explicit --output");
    const file = await client.downloadManagementWorkbook({
      startsOn: values.from,
      endsOn: values.to,
    });
    process.stdout.write(await writeDownloadedWorkbookOutput(values.output, file));
    return true;
  }

  if (resource === "sales-invoice-export" || resource === "purchase-expense-export") {
    if (!["export", "download"].includes(action) || !values.output || !values.from || !values.to)
      throw new Error(`${resource} download requires --from, --to, and explicit --output`);
    const file = await client.downloadAccountingListExport(
      resource === "sales-invoice-export" ? "sales-invoices" : "purchase-invoices-expenses",
      {
        startsOn: values.from,
        endsOn: values.to,
        ...(values.state ? { state: values.state } : {}),
        ...(values.party ? { partyId: values.party } : {}),
        ...(values["payee-party-id"] ? { payeePartyId: values["payee-party-id"] } : {}),
        ...(values["project-id"] ? { projectId: values["project-id"] } : {}),
        ...(values["invoice-presence"] ? { invoicePresence: values["invoice-presence"] } : {}),
      },
    );
    process.stdout.write(await writeDownloadedWorkbookOutput(values.output, file));
    return true;
  }

  if (resource === "workbook-import") {
    const result = await runWorkbookImport(
      client,
      values["project-workbook"],
      values["finance-workbook"],
      values.commit ?? false,
    );
    process.stdout.write(
      values.human ? `${JSON.stringify(result, null, 2)}\n` : `${JSON.stringify(result)}\n`,
    );
    return true;
  }

  return false;
}
