import { Controller, Get, Headers, Inject, Param, Query } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { ProjectProfitabilityService } from "./project-profitability.service.js";

@Controller("api/v1/organizations/:organizationId/reports/project-profitability")
export class ProjectProfitabilityController {
  constructor(
    @Inject(ProjectProfitabilityService) private readonly service: ProjectProfitabilityService,
  ) {}

  private context(organizationId: string, authorization?: string, correlationId?: string) {
    return this.service.authenticate(authorization, organizationId, correlationId ?? randomUUID());
  }

  @Get()
  async list(
    @Param("organizationId") organizationId: string,
    @Query() query: Record<string, string | undefined>,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.service.list(
      await this.context(organizationId, authorization, correlationId),
      this.service.parseQuery(query),
    );
  }

  @Get("projects/:projectId")
  async get(
    @Param("organizationId") organizationId: string,
    @Param("projectId") projectId: string,
    @Query() query: Record<string, string | undefined>,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.service.get(
      await this.context(organizationId, authorization, correlationId),
      projectId,
      this.service.parseQuery(query),
    );
  }
}
