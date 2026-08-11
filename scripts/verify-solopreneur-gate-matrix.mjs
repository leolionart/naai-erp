import fs from "node:fs";

const openapiPath = "docs/api/openapi-v1.json";
const matrixPath = "docs/implementation/solopreneur-gate-matrix.json";
const openapi = JSON.parse(fs.readFileSync(openapiPath, "utf8"));
const methods = ["post", "patch", "delete"];
const mutations = [];
for (const [path, item] of Object.entries(openapi.paths))
  for (const method of methods)
    if (item[method])
      mutations.push({
        method: method.toUpperCase(),
        path,
        operationId: item[method].operationId ?? null,
      });

const destructive = /\/local-admin\/reset|\bdelete\b|\/master-data\/.+\/{key}$/;
const correction =
  /reverse|repost|unreconcile|unmatch|relationship-backfill\/commit|supersede|fiscal-periods\/(close|reopen)/;
const posted =
  /\/journals\/.+\/post$|\/opening-balances$|owner-cash-withdrawals|customer-receipts$|project-freelance-payables\/.+\/pay$|\/reconcile$|internal-transfers\/.+\/match$|\/(commercial-documents|expenses|revenue-recognition-events)\/.+\/\{action\}$/;
const financialSurface =
  /journals|fiscal-periods|opening-balances|commercial-documents|expenses|customer-receipts|project-freelance-payables|reconcil|internal-transfers|revenue-recognition|workbook-imports\/commit|portable-data-packages\/imports\/.+\/commit/;

function effect(row) {
  const key = `${row.method} ${row.path} ${row.operationId ?? ""}`;
  if (destructive.test(key) || row.method === "DELETE") return "destructive";
  if (correction.test(key)) return "correction";
  if (/\/revenue-recognition-events\/.+\/\{action\}$/.test(row.path)) return "correction";
  if (/\/(commercial-documents|expenses)\/.+\/\{action\}$/.test(row.path)) return "posted";
  if (posted.test(row.path)) return "posted";
  if (row.path.includes("{action}") && !row.path.includes("customer-service-subscriptions"))
    return "draft";
  if (/create|imports|dry-run|evaluate|review|approve|close|deactivate|update|patch/i.test(key))
    return financialSurface.test(key) ? "draft" : "none";
  return financialSurface.test(key) ? "draft" : "none";
}

function entry(row) {
  const financialEffect = effect(row);
  const isFinancial = financialEffect === "posted" || financialEffect === "correction";
  const isDestructive = financialEffect === "destructive";
  return {
    id: `${row.method}:${row.path}`,
    method: row.method,
    path: row.path,
    operationId: row.operationId,
    resource: row.path.replace(/^.*?organizations\/\{organizationId\}\//, "").split("/")[0],
    action: row.path.split("/").at(-1),
    possibleActions: row.path.includes("{action}") ? dynamicActions(row.path) : [],
    financialEffect,
    current: {
      lifecycleStates: row.path.includes("{action}") ? ["route-dependent"] : ["endpoint-defined"],
      reason: isFinancial || isDestructive ? "required" : "endpoint-defined",
      checker: /approve|close|reopen/.test(row.path) ? "policy-controlled" : "endpoint-defined",
      version:
        row.method === "PATCH" || row.method === "DELETE"
          ? "required-or-resource-specific"
          : "endpoint-defined",
      idempotency:
        row.method === "POST" || row.method === "PATCH" || row.method === "DELETE"
          ? "required"
          : "not-applicable",
    },
    desiredSolopreneurBehavior:
      isFinancial || isDestructive
        ? "retain-explicit-action"
        : "eligible-for-one-click-or-canonical-default-review",
    retainedSafeguards: [
      "organization_scope",
      "rbac",
      "audit",
      "idempotency",
      ...(isFinancial ? ["period_lock", "balanced_posting", "posted_immutability"] : []),
      ...(isDestructive ? ["explicit_confirmation", "backup_or_reference_checks"] : []),
    ],
    uiActionFamily: row.path
      .replace(/^.*?organizations\/\{organizationId\}\//, "")
      .split("/")
      .slice(0, 2)
      .join("/"),
  };
}

function dynamicActions(path) {
  if (path.includes("revenue-recognition-events")) return ["submit", "approve", "post", "reverse"];
  if (path.includes("commercial-documents"))
    return ["capture", "validate", "verify", "approve", "issue", "post", "cancel"];
  if (path.includes("/expenses/")) return ["submit", "approve", "post", "reject", "discard"];
  return ["route-dependent"];
}

const generated = {
  schemaVersion: 1,
  task: "ERP-900",
  source: openapiPath,
  mutationCount: mutations.length,
  effectEnum: ["none", "draft", "posted", "correction", "destructive"],
  policy: {
    solopreneurOwner: "may compress eligible nonfinancial and draft-only workflow steps",
    controlledMode: "unchanged",
    financialBoundary:
      "posted, correction and destructive mutations remain explicit and retain all safeguards",
  },
  uiActionFamilies: [
    ...new Set(
      mutations.map((row) =>
        row.path
          .replace(/^.*?organizations\/\{organizationId\}\//, "")
          .split("/")
          .slice(0, 2)
          .join("/"),
      ),
    ),
  ].sort(),
  mutations: mutations.map(entry),
};

if (process.argv.includes("--write"))
  fs.writeFileSync(matrixPath, `${JSON.stringify(generated, null, 2)}\n`);
const matrix = JSON.parse(fs.readFileSync(matrixPath, "utf8"));
const expected = new Set(mutations.map((row) => `${row.method}:${row.path}`));
const actual = new Set(matrix.mutations.map((row) => row.id));
const missing = [...expected].filter((id) => !actual.has(id));
const extra = [...actual].filter((id) => !expected.has(id));
const invalid = matrix.mutations.filter(
  (row) => !generated.effectEnum.includes(row.financialEffect),
);
const financialNone = matrix.mutations.filter(
  (row) =>
    financialSurface.test(`${row.path} ${row.operationId ?? ""}`) && row.financialEffect === "none",
);
const hazardousActions = new Set(["post", "reverse", "reconcile", "unreconcile", "lock", "bill"]);
const unsafeDynamic = matrix.mutations.filter(
  (row) =>
    row.path.includes("{action}") &&
    row.possibleActions?.some((action) => hazardousActions.has(action)) &&
    ["none", "draft"].includes(row.financialEffect),
);
if (
  missing.length ||
  extra.length ||
  invalid.length ||
  financialNone.length ||
  unsafeDynamic.length
) {
  console.error(
    JSON.stringify(
      {
        missing,
        extra,
        invalid: invalid.map((x) => x.id),
        financialNone: financialNone.map((x) => x.id),
        unsafeDynamic: unsafeDynamic.map((x) => x.id),
      },
      null,
      2,
    ),
  );
  process.exit(1);
}
console.log(
  `Verified ${actual.size}/${expected.size} OpenAPI mutations; no financial surface is classified none.`,
);
