import { executeRequest, renderOutput } from "./list-output.js";
import { parseCliArgs } from "./main-cli-options.js";
import {
  tryBuildCommercialAndBankingPayload,
  validateCommercialAndBankingArgs,
} from "./main-commercial-and-banking.js";
import { tryRunFundingAndDraftsCommand } from "./main-funding-and-drafts.js";
import { tryRunPortableDataCommand } from "./main-portable-data.js";
import { resolveCliConnection, runProfileCommand } from "./main-profile-command.js";
import {
  applyOperatingDashboardPayload,
  tryBuildReportResourcePayload,
  tryRunAccountantExportDownload,
  validateReportCommandArgs,
} from "./main-reports.js";
import { tryRunWorkbookExportsCommand } from "./main-workbook-exports.js";
import { NaaiErpReadClient } from "./read-client.js";

const { values, positionals } = parseCliArgs();
const [resource, action = "list", profileName] = positionals;

if (resource === "profile") {
  await runProfileCommand(action, profileName, values);
}

const session = await resolveCliConnection(resource, action, values);
if (
  !resource ||
  (!session.discovery &&
    !session.crossEnvironmentClone &&
    (!session.organizationId || !session.token))
) {
  process.stderr.write(
    JSON.stringify({
      error:
        "resource, and for organization-scoped commands an organization (--organization, NAAI_ERP_ORGANIZATION or a saved `profile`) plus NAAI_ERP_TOKEN, are required",
    }) + "\n",
  );
  process.exitCode = 2;
} else {
  const client = new NaaiErpReadClient({
    baseUrl: session.baseUrl,
    ...(session.organizationId ? { organizationId: session.organizationId } : {}),
    ...(session.token ? { token: session.token } : {}),
  });
  try {
    if (await tryRunPortableDataCommand(client, resource, action, values, session)) {
      // Handled by portable-data subcommand module.
    } else if (await tryRunFundingAndDraftsCommand(client, resource, action, values)) {
      // Handled by drafts / owner-funding / integration-settings / funding-inference module.
    } else if (await tryRunWorkbookExportsCommand(client, resource, action, values)) {
      // Handled by workbook import/export subcommand module.
    } else {
      const bankContext = validateCommercialAndBankingArgs(resource, action, values);
      validateReportCommandArgs(resource, action, values);
      let payload: unknown;
      if (values.data) {
        payload = JSON.parse(values.data);
      } else {
        const reportMatch = tryBuildReportResourcePayload(resource, action, values);
        if (reportMatch.matched) {
          payload = reportMatch.payload;
        } else {
          const commercialMatch = await tryBuildCommercialAndBankingPayload(
            resource,
            action,
            values,
            bankContext,
          );
          payload = commercialMatch.matched ? commercialMatch.payload : undefined;
        }
      }
      const requestPayload = applyOperatingDashboardPayload(resource, payload, values);
      if (!(await tryRunAccountantExportDownload(client, resource, action, values))) {
        const result = await executeRequest(client, resource, action, requestPayload, values);
        const out = renderOutput(result, values);
        process.stdout.write(out.text);
        if (out.hint) process.stderr.write(`${out.hint}\n`);
      }
    }
  } catch (error) {
    process.stderr.write(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown CLI error" }) +
        "\n",
    );
    process.exitCode = 1;
  }
}
