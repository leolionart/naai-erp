import { buildDraftsRecordCliPayload } from "./draft-recording-cli.js";
import {
  buildIntegrationSourcesCliPayload,
  isIntegrationSettingsResource,
} from "./integration-sources-cli.js";
import type { CliValues } from "./main-cli-options.js";
import { buildOwnerFundingCliPayload, isOwnerFundingResource } from "./owner-funding-cli.js";
import type { NaaiErpReadClient } from "./read-client.js";

export async function tryRunFundingAndDraftsCommand(
  client: NaaiErpReadClient,
  resource: string,
  action: string,
  values: CliValues,
): Promise<boolean> {
  if (
    resource === "drafts" ||
    isOwnerFundingResource(resource) ||
    isIntegrationSettingsResource(resource)
  ) {
    const subPayload =
      resource === "drafts"
        ? await buildDraftsRecordCliPayload(action, values)
        : isOwnerFundingResource(resource)
          ? buildOwnerFundingCliPayload(action, values)
          : await buildIntegrationSourcesCliPayload(action, values);
    const result = await client.request(
      resource,
      action,
      subPayload,
      resource === "drafts" ? undefined : values.key,
      resource === "drafts" ? undefined : values.version,
      values["idempotency-key"],
    );
    process.stdout.write(
      values.human ? `${JSON.stringify(result, null, 2)}\n` : `${JSON.stringify(result)}\n`,
    );
    return true;
  }

  if (resource === "expense-funding-inference") {
    if (!["dry-run", "commit"].includes(action))
      throw new Error("expense-funding-inference supports dry-run and commit actions");
    if (!values.reason?.trim())
      throw new Error(`expense-funding-inference ${action} requires --reason`);
    if (action === "dry-run") {
      const result = await client.inferExpenseFundingDryRun(values.reason.trim());
      process.stdout.write(
        values.human ? `${JSON.stringify(result, null, 2)}\n` : `${JSON.stringify(result)}\n`,
      );
    } else {
      if (!values["plan-hash"] || !values["idempotency-key"])
        throw new Error(
          "expense-funding-inference commit requires --plan-hash and --idempotency-key",
        );
      const result = await client.commitExpenseFundingInference(
        { reason: values.reason.trim(), planHash: values["plan-hash"] },
        values["idempotency-key"],
      );
      process.stdout.write(
        values.human ? `${JSON.stringify(result, null, 2)}\n` : `${JSON.stringify(result)}\n`,
      );
    }
    return true;
  }

  return false;
}
