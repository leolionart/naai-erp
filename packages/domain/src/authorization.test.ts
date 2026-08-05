import { describe, expect, it } from "vitest";

import { hasRole, type AuthorizationContext } from "./authorization.js";

const context: AuthorizationContext = {
  actorId: "user-owner",
  organizationId: "org-naai",
  roles: ["owner", "approver"],
};

describe("authorization roles", () => {
  it("grants explicitly assigned roles", () => {
    expect(hasRole(context, "owner")).toBe(true);
  });

  it("denies unassigned roles by default", () => {
    expect(hasRole(context, "accountant")).toBe(false);
  });
});
