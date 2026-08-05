import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { NaaiErpClient } from "./client.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    organization: { type: "string" },
    "base-url": {
      type: "string",
      default: process.env.NAAI_ERP_BASE_URL ?? "http://localhost:3001",
    },
    data: { type: "string" },
    key: { type: "string" },
    version: { type: "string" },
    "idempotency-key": { type: "string" },
    from: { type: "string" },
    to: { type: "string" },
    account: { type: "string" },
    "account-id": { type: "string" },
    file: { type: "string" },
    adapter: { type: "string" },
    "adapter-version": { type: "string" },
    mapping: { type: "string" },
    human: { type: "boolean", default: false },
  },
});

const [resource, action = "list"] = positionals;
const organizationId = values.organization ?? process.env.NAAI_ERP_ORGANIZATION;
const token = process.env.NAAI_ERP_TOKEN;
const discovery = resource === "discovery" && ["openapi", "capabilities"].includes(action);
if (!resource || (!discovery && (!organizationId || !token))) {
  process.stderr.write(
    JSON.stringify({
      error:
        "resource, and for organization-scoped commands --organization/NAAI_ERP_ORGANIZATION plus NAAI_ERP_TOKEN, are required",
    }) + "\n",
  );
  process.exitCode = 2;
} else {
  const client = new NaaiErpClient({
    baseUrl: values["base-url"]!,
    ...(organizationId ? { organizationId } : {}),
    ...(token ? { token } : {}),
  });
  try {
    const bankAccountId = values["account-id"] ?? values.key;
    const bankAdapterVersion = Number.parseInt(values["adapter-version"] ?? "1", 10);
    if (resource === "bank-imports" && values.file) {
      if (!bankAccountId) throw new Error("--account-id or --key is required for bank imports");
      if (!Number.isInteger(bankAdapterVersion) || bankAdapterVersion < 1) {
        throw new Error("--adapter-version must be a positive integer");
      }
    }
    const payload = values.data
      ? JSON.parse(values.data)
      : resource === "bank-imports" && values.file
        ? {
            schemaVersion: 1,
            financialAccountId: bankAccountId,
            adapterId: values.adapter ?? "generic-csv",
            adapterVersion: bankAdapterVersion,
            filename: basename(values.file),
            csvText: await readFile(values.file, "utf8"),
            ...(values.mapping ? { columnMapping: JSON.parse(values.mapping) } : {}),
          }
        : resource === "reports"
          ? { from: values.from, to: values.to, accountCode: values.account }
          : resource.startsWith("bank-")
            ? {
                ...(values["account-id"] ? { financialAccountId: values["account-id"] } : {}),
                ...(values.from ? { from: values.from } : {}),
                ...(values.to ? { to: values.to } : {}),
              }
            : undefined;
    const result = await client.request(
      resource,
      action,
      payload,
      values.key,
      values.version,
      values["idempotency-key"],
    );
    process.stdout.write(
      values.human ? `${JSON.stringify(result, null, 2)}\n` : `${JSON.stringify(result)}\n`,
    );
  } catch (error) {
    process.stderr.write(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown CLI error" }) +
        "\n",
    );
    process.exitCode = 1;
  }
}
