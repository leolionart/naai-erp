import { Controller, Get, Headers, Inject, Param, Query } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { OperationalLogService } from "./operational-log.service.js";
@Controller("api/v1/organizations/:organizationId/operational-logs")
export class OperationalLogController {
  constructor(@Inject(OperationalLogService) private readonly service: OperationalLogService) {}
  @Get()
  async list(
    @Param("organizationId") organizationId: string,
    @Query() query: Record<string, string>,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    const limit = query.limit ? Number(query.limit) : undefined;
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 200))
      throw new Error("VALIDATION_FAILED");
    return this.service.list(
      await this.service.authenticate(authorization, organizationId, correlationId ?? randomUUID()),
      { ...query, ...(limit ? { limit } : {}) },
    );
  }

  @Get("all")
  async listAll(
    @Param("organizationId") organizationId: string,
    @Query() query: Record<string, string>,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    const limit = query.limit ? Number(query.limit) : undefined;
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 200))
      throw new Error("VALIDATION_FAILED");
    if (query.source && !["operational", "resource_audit", "planning_audit"].includes(query.source))
      throw new Error("VALIDATION_FAILED");
    return this.service.listAll(
      await this.service.authenticate(authorization, organizationId, correlationId ?? randomUUID()),
      { ...query, ...(limit ? { limit } : {}) } as Parameters<OperationalLogService["listAll"]>[1],
    );
  }

  @Get(":activityId/events")
  async events(
    @Param("organizationId") organizationId: string,
    @Param("activityId") activityId: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.service.listEvents(
      await this.service.authenticate(authorization, organizationId, correlationId ?? randomUUID()),
      activityId,
    );
  }
}
