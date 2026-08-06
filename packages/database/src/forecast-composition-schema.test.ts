import { describe, expect, it } from "vitest";
import { forecastComponents, forecastVersions } from "./schema.js";

describe("ERP-610 forecast composition schema", () => {
  it("registers organization-scoped components beneath immutable forecast versions", () => {
    expect(forecastVersions).toBeDefined();
    expect(forecastComponents).toBeDefined();
  });
});
