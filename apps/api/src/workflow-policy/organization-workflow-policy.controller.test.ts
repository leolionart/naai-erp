import { describe, expect, it, vi } from "vitest";
import { OrganizationWorkflowPolicyController } from "./organization-workflow-policy.controller.js";

describe("organization workflow policy controller", () => {
  it("returns organization-scoped derived capabilities", async () => {
    const masterData = {
      authenticate: vi.fn().mockResolvedValue({ correlationId: "corr-1", roles: ["owner"] }),
    };
    const workflowPolicy = {
      capabilities: vi.fn().mockResolvedValue({
        operatingMode: "solopreneur",
        ownerCanSelfApprove: true,
        requiresDistinctApprover: false,
        documentedTaxDefaultsFinal: true,
      }),
    };
    const controller = new OrganizationWorkflowPolicyController(
      masterData as never,
      workflowPolicy as never,
    );

    await expect(controller.get("naai", "Bearer token", "corr-1")).resolves.toMatchObject({
      organizationId: "naai",
      requestId: "corr-1",
      data: {
        operatingMode: "solopreneur",
        ownerCanSelfApprove: true,
        callerIsOwner: true,
        callerCanSaveAndRecord: true,
      },
    });
    expect(masterData.authenticate).toHaveBeenCalledWith("Bearer token", "naai", "corr-1");
    expect(workflowPolicy.capabilities).toHaveBeenCalledWith("naai");
  });
});
