type OpenApiOperation = Record<string, unknown> & { operationId?: string; tags?: string[] };
type OpenApiPathItem = Record<string, OpenApiOperation>;

export type DiscoverySpec = Record<string, unknown> & {
  openapi: string;
  info: { version: string };
  paths: Record<string, OpenApiPathItem>;
  "x-naai-resources"?: readonly string[];
  "x-naai-workflows"?: readonly string[];
};

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete"]);
const MASTER_RESOURCES = ["parties", "party-roles", "projects"] as const;

const retainedPrefixes = [
  "/api/v1/organizations/{organizationId}/service-plans",
  "/api/v1/organizations/{organizationId}/customer-service-subscriptions",
  "/api/v1/organizations/{organizationId}/commercial-documents",
  "/api/v1/organizations/{organizationId}/expenses",
  "/api/v1/organizations/{organizationId}/inbound-events",
  "/api/v1/organizations/{organizationId}/accountant-exports",
  "/api/v1/organizations/{organizationId}/report-snapshots",
  "/api/v1/organizations/{organizationId}/workbook-imports",
  "/api/v1/organizations/{organizationId}/reports/",
] as const;

function operationId(resource: string, path: string, method: string) {
  const suffix = path
    .replace("/api/v1/organizations/{organizationId}/master-data/{resource}", "")
    .replaceAll(/[{}]/g, "")
    .split("/")
    .filter(Boolean)
    .map((part) => part.replaceAll(/[^a-zA-Z0-9]+/g, " "))
    .flatMap((part) => part.split(" "))
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join("");
  return `${method}${resource
    .split("-")
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join("")}${suffix}`;
}

function concreteMasterDataPaths(paths: DiscoverySpec["paths"]) {
  const output: DiscoverySpec["paths"] = {};
  for (const [template, item] of Object.entries(paths)) {
    if (!template.includes("/master-data/{resource}")) continue;
    for (const resource of MASTER_RESOURCES) {
      if (template.endsWith("/deactivate") && resource !== "parties") continue;
      if (template.endsWith("/import/dry-run")) continue;
      const path = template.replace("{resource}", resource);
      output[path] = Object.fromEntries(
        Object.entries(item).map(([method, operation]) => [
          method,
          HTTP_METHODS.has(method)
            ? {
                ...operation,
                operationId:
                  operation.operationId ?? operationId(resource, template, method.toLowerCase()),
                tags: resource === "projects" ? ["projects"] : ["customers"],
              }
            : operation,
        ]),
      );
    }
  }
  return output;
}

function retainPath(path: string) {
  return (
    path === "/api/v1/openapi.json" ||
    path === "/api/v1/capabilities" ||
    path === "/api/v1/inbound/{sourcePublicId}/events" ||
    retainedPrefixes.some((prefix) => path.startsWith(prefix))
  );
}

export function mvpDiscoverySpec(source: DiscoverySpec): DiscoverySpec {
  const paths = Object.fromEntries(
    Object.entries(source.paths).filter(([path]) => retainPath(path)),
  );
  Object.assign(paths, concreteMasterDataPaths(source.paths));
  const workflowPrefixes = [
    "service-plans/",
    "customer-service-subscriptions/",
    "commercial-documents/",
    "expenses/",
    "inbound-events/",
    "report-snapshots/",
    "accountant-exports/",
    "workbook-imports/",
    "financial-statements/",
    "tax/",
    "reports/",
  ];
  return {
    ...source,
    paths,
    "x-naai-resources": [...MASTER_RESOURCES, "customer-subscriptions"],
    "x-naai-workflows": (source["x-naai-workflows"] ?? []).filter((workflow) =>
      workflowPrefixes.some((prefix) => workflow.startsWith(prefix)),
    ),
  };
}
