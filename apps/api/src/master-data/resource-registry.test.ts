import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  MASTER_DATA_RESOURCES,
  PROJECT_DELETE_DIMENSION_REFERENCES,
  PROJECT_DELETE_RELATIONAL_REFERENCES,
  decodeResourceKey,
  encodeResourceKey,
  resourceDefinition,
} from "./resource-registry.js";

describe("master-data resource registry", () => {
  it("is fully represented in committed OpenAPI", async () => {
    const openapi = JSON.parse(
      await readFile(new URL("../../../../docs/api/openapi-v1.json", import.meta.url), "utf8"),
    ) as { "x-naai-resources": string[] };
    expect(openapi["x-naai-resources"].sort()).toEqual(Object.keys(MASTER_DATA_RESOURCES).sort());
  });

  it("round-trips opaque composite keys", () => {
    const key = { fiscal_year: 2026, period_number: 8 };
    expect(decodeResourceKey(encodeResourceKey(key))).toEqual(key);
  });

  it("rejects arbitrary resource-to-table access", () => {
    expect(() => resourceDefinition("pg_catalog")).toThrow("Unknown master-data resource");
    expect(MASTER_DATA_RESOURCES["tax-code-versions"].mutableColumns).not.toContain("rate");
    expect(MASTER_DATA_RESOURCES["party-roles"].keyColumns).toEqual(["party_id", "role"]);
    expect(MASTER_DATA_RESOURCES.organizations.mutableColumns).toEqual(
      expect.arrayContaining(["tax_id", "registered_address"]),
    );
    expect(MASTER_DATA_RESOURCES.parties.writableColumns).toEqual(
      expect.arrayContaining(["legal_name", "registered_address", "email", "phone", "website"]),
    );
    expect(MASTER_DATA_RESOURCES.parties.mutableColumns).toEqual(
      expect.arrayContaining(["legal_name", "registered_address", "email", "phone", "website"]),
    );
    expect(MASTER_DATA_RESOURCES.projects.mutableColumns).toContain("client_party_id");
    expect(MASTER_DATA_RESOURCES.projects.writableColumns).toContain("default_service_line_code");
    expect(MASTER_DATA_RESOURCES.projects.mutableColumns).toContain("default_service_line_code");
    expect(MASTER_DATA_RESOURCES["purchase-products"]).toMatchObject({
      table: "purchase_products",
      writableColumns: ["code", "name", "vat_rate_percent", "is_active"],
      mutableColumns: ["name", "vat_rate_percent", "is_active"],
      deactivate: { column: "is_active", value: false },
      versionColumn: "version",
    });
    expect(MASTER_DATA_RESOURCES["accounting-workflow-policy"]).toMatchObject({
      writableColumns: expect.arrayContaining(["operating_mode"]),
      mutableColumns: expect.arrayContaining(["operating_mode"]),
    });
  });

  it("allows hard delete only for projects and enumerates every reference blocker", () => {
    expect(MASTER_DATA_RESOURCES.projects.deletePolicy).toEqual({
      relationalReferences: PROJECT_DELETE_RELATIONAL_REFERENCES,
      dimensionReferences: PROJECT_DELETE_DIMENSION_REFERENCES,
    });
    expect(PROJECT_DELETE_RELATIONAL_REFERENCES).toHaveLength(9);
    expect(PROJECT_DELETE_DIMENSION_REFERENCES).toHaveLength(8);
    expect("deletePolicy" in MASTER_DATA_RESOURCES.parties).toBe(false);
  });
});
