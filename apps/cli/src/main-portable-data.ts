import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { executeCrossEnvironmentClone } from "./cli-http-helpers.js";
import { NaaiErpClient } from "./client.js";
import type { CliValues } from "./main-cli-options.js";
import { writeDownloadedWorkbookOutput } from "./payment-evidence-cli.js";
import type { NaaiErpReadClient } from "./read-client.js";

export type PortableDataSessionContext = Readonly<{
  organizationId: string | undefined;
  token: string | undefined;
  crossEnvironmentClone: boolean;
}>;

export async function tryRunPortableDataCommand(
  client: NaaiErpReadClient,
  resource: string,
  action: string,
  values: CliValues,
  session: PortableDataSessionContext,
): Promise<boolean> {
  if (resource === "portable-data-restore") {
    if (
      action !== "empty" ||
      !values.file ||
      !values["source-organization"] ||
      !values["confirm-organization"] ||
      !values.reason ||
      !values["idempotency-key"]
    )
      throw new Error(
        "portable-data-restore empty requires --file, --source-organization, --confirm-organization, --reason, and --idempotency-key",
      );
    const content = await readFile(values.file);
    const workbookSha256 = createHash("sha256").update(content).digest("hex");
    const packageId = values.key;
    if (!packageId) throw new Error("portable-data-restore empty requires --key package ID");
    const result = await client.portableDataRequest(
      "imports/restore-empty",
      "POST",
      {
        sourceOrganizationId: values["source-organization"],
        confirmTargetOrganizationId: values["confirm-organization"],
        packageId,
        workbookSha256,
        reason: values.reason,
        workbookBase64: content.toString("base64"),
        mapSourceActorsToTargetActor: true,
      },
      values["idempotency-key"],
    );
    process.stdout.write(JSON.stringify(result) + "\n");
    return true;
  }

  if (session.crossEnvironmentClone) {
    const cloned = await executeCrossEnvironmentClone(NaaiErpClient, {
      sourceBaseUrl: values["source-base-url"],
      sourceOrganization: values["source-organization"],
      sourceToken: values["source-token"] ?? process.env.NAAI_ERP_SOURCE_TOKEN,
      targetBaseUrl: values["target-base-url"] ?? values["base-url"],
      targetOrganization: values["target-organization"] ?? session.organizationId,
      targetToken: values["target-token"] ?? session.token,
      reason: values.reason,
      idempotencyKey: values["idempotency-key"],
      asOf: values["as-of"],
    });
    process.stdout.write(
      values.human ? `${JSON.stringify(cloned, null, 2)}\n` : `${JSON.stringify(cloned)}\n`,
    );
    return true;
  }

  if (resource === "portable-data-reset") {
    if (
      action !== "local" ||
      !values["confirm-organization"] ||
      !values.key ||
      !values["workbook-sha256"] ||
      !values["idempotency-key"]
    )
      throw new Error(
        "portable-data-reset local requires --confirm-organization, --key, --workbook-sha256, and --idempotency-key",
      );
    if (values["confirm-organization"] !== session.organizationId)
      throw new Error("--confirm-organization must exactly match the target organization");
    if (!/^[a-fA-F0-9]{64}$/.test(values["workbook-sha256"]))
      throw new Error("--workbook-sha256 must be a 64-character SHA-256");
    const result = await client.resetLocalOrganization(
      {
        confirmOrganizationId: values["confirm-organization"],
        packageId: values.key,
        workbookSha256: values["workbook-sha256"].toLowerCase(),
      },
      values["idempotency-key"],
    );
    process.stdout.write(
      values.human ? `${JSON.stringify(result, null, 2)}\n` : `${JSON.stringify(result)}\n`,
    );
    return true;
  }

  if (resource === "portable-data-export") {
    if (action === "download") {
      if (!values.key || !values.output)
        throw new Error("portable-data-export download requires --key and explicit --output");
      const file = await client.downloadPortableDataPackage(values.key);
      process.stdout.write(await writeDownloadedWorkbookOutput(values.output, file));
    } else {
      const path =
        action === "export"
          ? "exports"
          : action === "list" || action === "history"
            ? "exports"
            : action === "status"
              ? `exports/${encodeURIComponent(values.key ?? "")}`
              : action === "inventory"
                ? `exports/${encodeURIComponent(values.key ?? "")}/inventory`
                : "";
      if (!path) throw new Error(`Unsupported portable-data-export action: ${action}`);
      if (!["export", "list", "history"].includes(action) && !values.key)
        throw new Error(`portable-data-export ${action} requires --key`);
      const result = await client.portableDataRequest(
        path,
        action === "export" ? "POST" : "GET",
        action === "export"
          ? values.data
            ? JSON.parse(values.data)
            : { ...(values["as-of"] ? { asOf: values["as-of"] } : {}) }
          : undefined,
        values["idempotency-key"],
      );
      process.stdout.write(
        values.human ? `${JSON.stringify(result, null, 2)}\n` : `${JSON.stringify(result)}\n`,
      );
    }
    return true;
  }

  if (resource === "portable-data-import") {
    if (action === "inventory" || action === "dry-run") {
      if (!values.file) throw new Error(`portable-data-import ${action} requires --file`);
      const result = await client.uploadPortableWorkbook(
        action,
        basename(values.file),
        new Uint8Array(await readFile(values.file)),
        values["idempotency-key"],
      );
      process.stdout.write(
        values.human ? `${JSON.stringify(result, null, 2)}\n` : `${JSON.stringify(result)}\n`,
      );
    } else if (action === "status") {
      if (!values.key) throw new Error("portable-data-import status requires --key");
      const result = await client.portableDataRequest(
        `imports/${encodeURIComponent(values.key)}`,
        "GET",
      );
      process.stdout.write(`${JSON.stringify(result)}\n`);
    } else if (action === "commit") {
      if (!values.key || !values["dry-run-id"] || !values["workbook-sha256"])
        throw new Error(
          "portable-data-import commit requires --key, --dry-run-id, and --workbook-sha256",
        );
      const result = await client.portableDataRequest(
        `imports/${encodeURIComponent(values.key)}/commit`,
        "POST",
        { dryRunId: values["dry-run-id"], workbookSha256: values["workbook-sha256"] },
        values["idempotency-key"],
      );
      process.stdout.write(
        values.human ? `${JSON.stringify(result, null, 2)}\n` : `${JSON.stringify(result)}\n`,
      );
    } else throw new Error(`Unsupported portable-data-import action: ${action}`);
    return true;
  }

  return false;
}
