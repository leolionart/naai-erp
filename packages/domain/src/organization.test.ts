import { describe, expect, it } from "vitest";

import { assertSameOrganization, organizationId } from "./organization.js";

describe("organization isolation", () => {
  it("accepts access inside the same organization", () => {
    const id = organizationId("org-naai");
    expect(() => assertSameOrganization(id, id)).not.toThrow();
  });

  it("rejects cross-organization access", () => {
    expect(() =>
      assertSameOrganization(organizationId("org-naai"), organizationId("org-other")),
    ).toThrow("Cross-organization access is forbidden");
  });

  it("rejects an empty organization ID", () => {
    expect(() => organizationId("  ")).toThrow("Organization ID is required");
  });
});
