import { parseArgs } from "node:util";
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
    from: { type: "string" },
    to: { type: "string" },
    account: { type: "string" },
    human: { type: "boolean", default: false },
  },
});

const [resource, action = "list"] = positionals;
const organizationId = values.organization ?? process.env.NAAI_ERP_ORGANIZATION;
const token = process.env.NAAI_ERP_TOKEN;
if (!resource || !organizationId || !token) {
  process.stderr.write(
    JSON.stringify({
      error: "resource, --organization/NAAI_ERP_ORGANIZATION and NAAI_ERP_TOKEN are required",
    }) + "\n",
  );
  process.exitCode = 2;
} else {
  const client = new NaaiErpClient({ baseUrl: values["base-url"]!, organizationId, token });
  try {
    const payload = values.data
      ? JSON.parse(values.data)
      : resource === "reports"
        ? { from: values.from, to: values.to, accountCode: values.account }
        : undefined;
    const result = await client.request(resource, action, payload, values.key, values.version);
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
