import { Controller, Get } from "@nestjs/common";
import { readFile } from "node:fs/promises";
import { mvpDiscoverySpec, type DiscoverySpec } from "./mvp-discovery.js";
@Controller("api/v1")
export class DiscoveryController {
  private async spec() {
    const source = JSON.parse(
      await readFile(new URL("../../../../docs/api/openapi-v1.json", import.meta.url), "utf8"),
    ) as DiscoverySpec;
    return mvpDiscoverySpec(source);
  }
  @Get("openapi.json") openapi() {
    return this.spec();
  }
  @Get("capabilities") async capabilities() {
    const spec = await this.spec();
    const operations = Object.entries(spec.paths).flatMap(([path, item]) =>
      Object.entries(item)
        .filter(([method]) => ["get", "post", "put", "patch", "delete"].includes(method))
        .map(([method, operation]) => ({
          operationId: operation.operationId ?? `${method}:${path}`,
          method: method.toUpperCase(),
          path,
          tags: operation.tags ?? [],
          organizationScoped: path.includes("{organizationId}"),
        })),
    );
    return {
      apiVersion: "v1",
      openapiVersion: spec.openapi,
      contractVersion: spec.info.version,
      openapiUrl: "/api/v1/openapi.json",
      authentication: {
        scheme: "bearer",
        organizationScope:
          "Path parameter {organizationId}; credentials are scoped to one organization.",
      },
      resources: [...new Set(operations.flatMap((x) => x.tags))].sort(),
      operations,
    };
  }
}
