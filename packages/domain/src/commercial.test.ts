import { describe, expect, it } from "vitest";
import {
  assertProjectAcceptsAllocation,
  createContract,
  createMilestone,
  createParty,
  createProject,
  mergeParty,
  transitionProject,
} from "./commercial.js";

describe("ERP-130 commercial master data", () => {
  it("allows a party to hold multiple explicit roles", () => {
    const party = createParty({
      organizationId: "org-naai",
      id: "party-1",
      displayName: "Partner",
      roles: ["client", "supplier", "client"],
    });
    expect(party.roles).toEqual(["client", "supplier"]);
  });

  it("merges parties without deleting identity and rejects cross-org merge", () => {
    const source = createParty({
      organizationId: "org-naai",
      id: "p1",
      displayName: "Old",
      roles: ["client"],
    });
    const target = createParty({
      organizationId: "org-naai",
      id: "p2",
      displayName: "New",
      roles: ["client"],
    });
    expect(mergeParty(source, target)).toMatchObject({ status: "merged", mergedIntoPartyId: "p2" });
    const foreign = createParty({
      organizationId: "org-other",
      id: "p3",
      displayName: "Other",
      roles: ["client"],
    });
    expect(() => mergeParty(source, foreign)).toThrow("same organization");
  });

  it("validates project lifecycle and approved reopen", () => {
    const project = createProject({
      organizationId: "org-naai",
      id: "prj-1",
      code: "WEB-001",
      name: "Web app",
      clientPartyId: "p1",
      ownerUserId: "user-a",
      contractType: "fixed_fee",
      currency: "VND",
      budgetMinor: 100_000_000n,
      startsOn: "2026-08-01",
    });
    const active = transitionProject(project, "active");
    const closed = transitionProject(active, "closed");
    expect(() => assertProjectAcceptsAllocation(closed)).toThrow("Closed project");
    expect(() => transitionProject(closed, "active")).toThrow("Invalid project transition");
    expect(transitionProject(closed, "active", true).state).toBe("active");
  });

  it("creates organization-scoped contracts and milestones with exact minor units", () => {
    const contract = createContract({
      organizationId: "org-naai",
      id: "ctr-1",
      projectId: "prj-1",
      reference: "NAAI/2026/01",
      signedOn: "2026-08-01",
      valueMinor: 110_000_000n,
      currency: "VND",
    });
    const milestone = createMilestone({
      organizationId: "org-naai",
      id: "ms-1",
      contractId: contract.id,
      name: "Go-live",
      dueOn: "2026-10-01",
      amountMinor: 55_000_000n,
    });
    expect(milestone.amountMinor).toBe(55_000_000n);
  });
});
