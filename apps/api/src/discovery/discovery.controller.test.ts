import { describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";
describe("headless API discovery", () => {
  it("serves canonical OpenAPI and a derived capability index", async () => {
    const app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    const spec = await app.inject({ method: "GET", url: "/api/v1/openapi.json" });
    expect(spec.statusCode).toBe(200);
    expect(spec.json().paths).toHaveProperty(
      "/api/v1/organizations/{organizationId}/banking/internal-transfers",
    );
    expect(spec.json().paths).toHaveProperty(
      "/api/v1/organizations/{organizationId}/reports/ar-aging",
    );
    expect(spec.json().paths).toHaveProperty(
      "/api/v1/organizations/{organizationId}/banking/statement-sessions/{sessionId}/review",
    );
    expect(spec.json().paths).toHaveProperty(
      "/api/v1/organizations/{organizationId}/time/capacity-summary",
    );
    expect(spec.json().paths).toHaveProperty(
      "/api/v1/organizations/{organizationId}/direct-cost-allocations",
    );
    const caps = await app.inject({ method: "GET", url: "/api/v1/capabilities" });
    expect(caps.statusCode).toBe(200);
    expect(caps.json().operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operationId: "createInternalTransfer",
          organizationScoped: true,
        }),
        expect.objectContaining({ operationId: "listArAging", organizationScoped: true }),
        expect.objectContaining({
          operationId: "createBankStatementSession",
          organizationScoped: true,
        }),
        expect.objectContaining({ operationId: "createTimesheet", organizationScoped: true }),
        expect.objectContaining({
          operationId: "createDirectCostAllocation",
          organizationScoped: true,
        }),
      ]),
    );
    expect(caps.json().authentication.scheme).toBe("bearer");
    await app.close();
  });
});
