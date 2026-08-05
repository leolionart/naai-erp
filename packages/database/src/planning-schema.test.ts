import { describe, expect, it } from "vitest";
import { forecastVersions, planningAuditEvents, revenueTargetVersions, schema } from "./schema.js";

describe("ERP-600 planning schema", () => {
  it("registers organization-scoped targets, immutable forecast metadata and audit events", () => {
    expect(schema.revenueTargetVersions).toBe(revenueTargetVersions);
    expect(schema.forecastVersions).toBe(forecastVersions);
    expect(schema.planningAuditEvents).toBe(planningAuditEvents);
  });
});
