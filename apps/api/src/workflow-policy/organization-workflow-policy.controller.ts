import { Controller, Get, Headers, Inject, Param } from "@nestjs/common";
import { API_VERSION } from "@naai-erp/contracts";
import { randomUUID } from "node:crypto";
import { MasterDataService } from "../master-data/master-data.service.js";
import { OrganizationWorkflowPolicyService } from "./organization-workflow-policy.service.js";

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
    return {
      apiVersion: API_VERSION,
      requestId: context.correlationId,
      organizationId,
      data: await this.workflowPolicy.capabilities(organizationId),
    };
  }
}
