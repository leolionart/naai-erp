import { describe, expect, it } from "vitest";
import { buildAiDiscoveryEndpoints } from "./automation-api-dialog";

describe("AI-native discovery endpoints helper (ADR-014 / BR-AI-007)", () => {
  it("builds canonical organization, capabilities, OpenAPI, webhook and CLI discovery metadata", () => {
    const endpoints = buildAiDiscoveryEndpoints("https://erp.naai.studio/", "naai");

    expect(endpoints).toEqual({
      organizationApiBase: "https://erp.naai.studio/api/v1/organizations/naai",
      capabilitiesUrl: "https://erp.naai.studio/api/v1/capabilities",
      openApiUrl: "https://erp.naai.studio/api/v1/openapi.json",
      inboundWebhookTemplate: "https://erp.naai.studio/api/v1/webhooks/inbound/{publicId}",
      cliCommands: [
        "naai-erp discovery capabilities",
        "naai-erp discovery describe --key expenses",
        "naai-erp discovery openapi --tag expenses",
      ],
    });
  });

  it("URL-encodes organization identifiers and never embeds bearer secrets or database connection strings", () => {
    const endpoints = buildAiDiscoveryEndpoints("http://localhost:3001", "org/alpha beta");
    const serialized = JSON.stringify(endpoints);

    expect(endpoints.organizationApiBase).toBe(
      "http://localhost:3001/api/v1/organizations/org%2Falpha%20beta",
    );
    expect(serialized).not.toContain("Bearer");
    expect(serialized).not.toContain("Authorization");
    expect(serialized).not.toContain("naai_sk_");
    expect(serialized).not.toContain("naai_whsec_");
    expect(serialized).not.toContain("postgres");
    expect(serialized).not.toContain("DATABASE_URL");
  });
});
