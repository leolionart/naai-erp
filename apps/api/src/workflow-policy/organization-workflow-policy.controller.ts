import { Body, Controller, Get, Headers, Inject, Param, Patch } from "@nestjs/common";
import { API_VERSION } from "@naai-erp/contracts";
import { randomUUID } from "node:crypto";
import { MasterDataService } from "../master-data/master-data.service.js";
import { OrganizationWorkflowPolicyService } from "./organization-workflow-policy.service.js";
import type { UpdateOrganizationWorkflowPolicyInput } from "./organization-workflow-policy.types.js";

@Controller("api/v1/organizations/:organizationId")
export class OrganizationWorkflowPolicyController {
  constructor(
    @Inject(MasterDataService) private readonly masterData: MasterDataService,
    @Inject(OrganizationWorkflowPolicyService)
    private readonly workflowPolicy: OrganizationWorkflowPolicyService,
  ) {}

  @Get("organization-workflow-policy")
  async get(
    @Param("organizationId") organizationId: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    const context = await this.masterData.authenticate(
      authorization,
      organizationId,
      correlationId ?? randomUUID(),
    );
    const capabilities = await this.workflowPolicy.capabilities(organizationId);
    return {
      apiVersion: API_VERSION,
      requestId: context.correlationId,
      organizationId,
      data: {
        ...capabilities,
        callerIsOwner: context.roles.includes("owner"),
        callerCanSaveAndRecord:
          capabilities.operatingMode === "solopreneur" && context.roles.includes("owner"),
      },
    };
  }

  @Patch("organization-workflow-policy")
  async update(
    @Param("organizationId") organizationId: string,
    @Body() input: UpdateOrganizationWorkflowPolicyInput,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const context = await this.masterData.authenticate(
      authorization,
      organizationId,
      correlationId ?? randomUUID(),
    );
    const updated = await this.workflowPolicy.update(context, input, idempotencyKey);
    return {
      apiVersion: API_VERSION,
      requestId: context.correlationId,
      organizationId,
      data: {
        ...updated,
        callerIsOwner: context.roles.includes("owner"),
        callerCanSaveAndRecord:
          updated.operatingMode === "solopreneur" && context.roles.includes("owner"),
      },
    };
  }
}
