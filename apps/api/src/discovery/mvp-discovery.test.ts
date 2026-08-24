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
        "/api/v1/organizations/{organizationId}/service-plans": {
          get: { operationId: "listServicePlans" },
          post: { operationId: "createServicePlan" },
        },
        "/api/v1/organizations/{organizationId}/customer-service-subscriptions": {
          get: { operationId: "listCustomerServiceSubscriptions" },
        },
      },
      "x-naai-resources": ["accounts", "parties", "projects"],
      "x-naai-workflows": [
        "commercial-documents/create",
        "workbook-imports/dry-run",
        "expenses/create",
        "service-plans/create",
        "customer-service-subscriptions/create",
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
    expect(filtered["x-naai-workflows"]).toEqual([
      "commercial-documents/create",
      "workbook-imports/dry-run",
      "expenses/create",
      "service-plans/create",
      "customer-service-subscriptions/create",
    ]);
    expect(filtered.paths).toHaveProperty("/api/v1/organizations/{organizationId}/service-plans");
    expect(filtered.paths).toHaveProperty(
      "/api/v1/organizations/{organizationId}/customer-service-subscriptions",
    );
    expect(filtered["x-naai-resources"]).toContain("customer-subscriptions");
    expect(source.paths).toHaveProperty(
      "/api/v1/organizations/{organizationId}/master-data/{resource}",
    );
  });
});
