import { describe, expect, it } from "vitest";
import {
  canSelfApprove,
  bootstrapSolopreneurPolicy,
  environmentSolopreneurEnabled,
  resolveOrganizationWorkflowPolicy,
  workflowCapabilities,
} from "./organization-workflow-policy.service.js";

describe("organization workflow policy", () => {
  it("derives solopreneur capabilities and permits only an owner to self approve", () => {
    const policy = {
      operatingMode: "solopreneur" as const,
      allowSelfApproval: false,
      selfApprovalMaxMinor: null,
    };
    expect(workflowCapabilities(policy)).toEqual({
      operatingMode: "solopreneur",
      ownerCanSelfApprove: true,
      requiresDistinctApprover: false,
      allowsBoundedSelfApproval: false,
      documentedTaxDefaultsFinal: true,
    });
    expect(canSelfApprove({ policy, roles: ["owner"] })).toBe(true);
    expect(canSelfApprove({ policy, roles: ["finance_admin"] })).toBe(false);
  });

  it("keeps controlled self approval bounded by its explicit threshold", () => {
    const policy = {
      operatingMode: "controlled" as const,
      allowSelfApproval: true,
      selfApprovalMaxMinor: 1_000n,
    };
    expect(canSelfApprove({ policy, roles: ["owner"], amountMinor: 1_000n })).toBe(true);
    expect(canSelfApprove({ policy, roles: ["owner"], amountMinor: 1_001n })).toBe(false);
    expect(canSelfApprove({ policy, roles: ["owner"] })).toBe(false);
    expect(workflowCapabilities(policy)).toEqual({
      operatingMode: "controlled",
      ownerCanSelfApprove: false,
      requiresDistinctApprover: true,
      allowsBoundedSelfApproval: true,
      documentedTaxDefaultsFinal: false,
    });
  });

  it("parses the bootstrap flag strictly", () => {
    expect(environmentSolopreneurEnabled({})).toBe(false);
    expect(environmentSolopreneurEnabled({ NAAI_ERP_SOLOPRENEUR: " true " })).toBe(true);
    expect(environmentSolopreneurEnabled({ NAAI_ERP_SOLOPRENEUR: "false" })).toBe(false);
    expect(() => environmentSolopreneurEnabled({ NAAI_ERP_SOLOPRENEUR: "yes" })).toThrow(
      "must be true or false",
    );
  });

  it("bootstraps a missing policy", async () => {
    const calls: string[] = [];
    const database = {
      query: async (sql: string) => {
        calls.push(sql);
        return calls.length === 1
          ? { rows: [{ exists: 1 }], rowCount: 1 }
          : { rows: [{ organization_id: "naai" }], rowCount: 1 };
      },
    };
    await expect(
      bootstrapSolopreneurPolicy(database as never, {
        NAAI_ERP_SOLOPRENEUR: "true",
        NAAI_ERP_LOGIN_ORGANIZATION: "naai",
      }),
    ).resolves.toBe(true);
  });

  it("never overwrites an existing controlled policy", async () => {
    const calls: string[] = [];
    const database = {
      query: async (sql: string) => {
        calls.push(sql);
        return calls.length === 1
          ? { rows: [{ exists: 1 }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      },
    };
    await expect(
      bootstrapSolopreneurPolicy(database as never, {
        NAAI_ERP_SOLOPRENEUR: "true",
        NAAI_ERP_LOGIN_ORGANIZATION: "naai",
      }),
    ).resolves.toBe(false);
    expect(calls[1]).toContain("on conflict(organization_id) do nothing");
    expect(calls[1]).not.toContain("do update");
  });

  it("requires an explicit existing login organization for bootstrap", async () => {
    await expect(
      bootstrapSolopreneurPolicy({ query: async () => ({ rows: [], rowCount: 0 }) } as never, {
        NAAI_ERP_SOLOPRENEUR: "true",
      }),
    ).rejects.toThrow("NAAI_ERP_LOGIN_ORGANIZATION is required");
    await expect(
      bootstrapSolopreneurPolicy({ query: async () => ({ rows: [], rowCount: 0 }) } as never, {
        NAAI_ERP_SOLOPRENEUR: "true",
        NAAI_ERP_LOGIN_ORGANIZATION: "missing",
      }),
    ).rejects.toThrow("does not exist");
  });

  it("resolves a missing organization policy as controlled", async () => {
    await expect(
      resolveOrganizationWorkflowPolicy("naai", {
        query: async () => ({ rows: [], rowCount: 0 }),
      } as never),
    ).resolves.toEqual({
      operatingMode: "controlled",
      allowSelfApproval: false,
      selfApprovalMaxMinor: null,
    });
  });
});
