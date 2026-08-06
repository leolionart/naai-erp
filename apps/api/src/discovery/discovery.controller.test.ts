import { describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";

const organization = "/api/v1/organizations/{organizationId}";

describe("MVP headless API discovery", () => {
  it("publishes only invoice, ingestion, customer/project and reporting operations", async () => {
    const app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const response = await app.inject({ method: "GET", url: "/api/v1/openapi.json" });
    expect(response.statusCode).toBe(200);
    const spec = response.json() as {
      paths: Record<string, Record<string, unknown>>;
      "x-naai-resources": string[];
      components: {
        schemas: Record<string, { required?: string[]; properties?: Record<string, unknown> }>;
      };
    };

    for (const retained of [
      "/api/v1/inbound/{sourcePublicId}/events",
      `${organization}/commercial-documents`,
      `${organization}/commercial-documents/{documentId}`,
      `${organization}/inbound-events`,
      `${organization}/master-data/parties`,
      `${organization}/master-data/party-roles`,
      `${organization}/master-data/projects`,
      `${organization}/reports/ar-aging`,
      `${organization}/reports/ap-aging`,
      `${organization}/reports/financial-statements/profit-and-loss`,
      `${organization}/reports/financial-statements/drilldown`,
      `${organization}/reports/project-profitability`,
      `${organization}/accountant-exports`,
      `${organization}/report-snapshots`,
      `${organization}/workbook-imports/dry-run`,
      `${organization}/workbook-imports/commit`,
    ]) {
      expect(spec.paths, retained).toHaveProperty(retained);
    }

    for (const excluded of [
      `${organization}/banking/accounts`,
      `${organization}/evidence`,
      `${organization}/forecast-versions`,
      `${organization}/journals`,
      `${organization}/master-data/{resource}`,
      `${organization}/milestone-acceptances`,
      `${organization}/outbound-events/outbox`,
      `${organization}/overhead-allocation-runs`,
      `${organization}/project-budgets`,
      `${organization}/project-costs`,
      `${organization}/project-revenue-position/{projectId}`,
      `${organization}/revenue-recognition-events`,
      `${organization}/scope-changes`,
      `${organization}/time/timesheets`,
    ]) {
      expect(spec.paths, excluded).not.toHaveProperty(excluded);
    }
    expect(spec["x-naai-resources"]).toEqual(["parties", "party-roles", "projects"]);
    expect(spec.paths[`${organization}/workbook-imports/dry-run`]?.post).toMatchObject({
      operationId: "dryRunWorkbookImport",
      requestBody: {
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/WorkbookImportRequest" },
          },
        },
      },
    });
    expect(spec.paths[`${organization}/workbook-imports/commit`]?.post).toMatchObject({
      operationId: "commitWorkbookImport",
    });
    expect(spec.paths[`${organization}/expenses`]?.get).toBeDefined();
    expect(spec.components.schemas.WorkbookImportDetails?.required).toContain("expensesSkipped");

    const capabilities = await app.inject({ method: "GET", url: "/api/v1/capabilities" });
    expect(capabilities.statusCode).toBe(200);
    const body = capabilities.json() as {
      resources: string[];
      operations: Array<{ operationId: string; path: string; organizationScoped: boolean }>;
    };
    expect(body.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: `${organization}/commercial-documents` }),
        expect.objectContaining({ path: `${organization}/master-data/parties` }),
        expect.objectContaining({ path: `${organization}/master-data/projects` }),
        expect.objectContaining({ path: `${organization}/reports/ar-aging` }),
        expect.objectContaining({ path: `${organization}/accountant-exports` }),
        expect.objectContaining({ path: `${organization}/workbook-imports/dry-run` }),
      ]),
    );
    expect(body.operations.every((operation) => !operation.path.includes("{resource}"))).toBe(true);
    expect(
      body.operations.every(
        (operation) => operation.organizationScoped || operation.path.startsWith("/api/v1/"),
      ),
    ).toBe(true);
    expect(body.resources).toEqual(expect.arrayContaining(["customers", "projects"]));
    expect(body.resources).not.toEqual(
      expect.arrayContaining(["banking", "timesheets", "overhead"]),
    );

    await app.close();
  });
});
