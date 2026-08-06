import { describe, expect, it } from "vitest";
import { mvpDiscoverySpec, type DiscoverySpec } from "./mvp-discovery.js";

describe("mvpDiscoverySpec", () => {
  it("specializes customer/project master data without mutating the canonical source", () => {
    const source: DiscoverySpec = {
      openapi: "3.1.0",
      info: { version: "1" },
      paths: {
        "/api/v1/organizations/{organizationId}/master-data/{resource}": {
          get: { summary: "list" },
          post: { summary: "create" },
        },
        "/api/v1/organizations/{organizationId}/master-data/{resource}/{key}/deactivate": {
          post: { summary: "deactivate" },
        },
        "/api/v1/organizations/{organizationId}/time/timesheets": {
          get: { operationId: "listTimesheets" },
        },
      },
      "x-naai-resources": ["accounts", "parties", "projects"],
      "x-naai-workflows": [
        "commercial-documents/create",
        "workbook-imports/dry-run",
        "expenses/create",
      ],
    };

    const filtered = mvpDiscoverySpec(source);
    expect(filtered.paths).toHaveProperty(
      "/api/v1/organizations/{organizationId}/master-data/parties",
    );
    expect(filtered.paths).toHaveProperty(
      "/api/v1/organizations/{organizationId}/master-data/projects",
    );
    expect(filtered.paths).toHaveProperty(
      "/api/v1/organizations/{organizationId}/master-data/parties/{key}/deactivate",
    );
    expect(filtered.paths).not.toHaveProperty(
      "/api/v1/organizations/{organizationId}/master-data/projects/{key}/deactivate",
    );
    expect(filtered.paths).not.toHaveProperty(
      "/api/v1/organizations/{organizationId}/time/timesheets",
    );
    expect(filtered["x-naai-workflows"]).toEqual([
      "commercial-documents/create",
      "workbook-imports/dry-run",
      "expenses/create",
    ]);
    expect(source.paths).toHaveProperty(
      "/api/v1/organizations/{organizationId}/master-data/{resource}",
    );
  });
});
