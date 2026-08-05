import { Body, Controller, Get, Headers, Inject, Param, Post, Query } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PlanningService } from "./planning.service.js";
import type { PlanningResource } from "./planning.types.js";

abstract class PlanningResourceController {
  abstract readonly resource: PlanningResource;
  constructor(@Inject(PlanningService) protected readonly service: PlanningService) {}
  private context(org: string, auth?: string, correlation?: string) {
    return this.service.authenticate(auth, org, correlation ?? randomUUID());
  }
  @Get() async list(
    @Param("organizationId") org: string,
    @Query() query: Record<string, string | undefined>,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") correlation?: string,
  ) {
    return this.service.list(await this.context(org, auth, correlation), this.resource, query);
  }
  @Get(":id") async get(
    @Param("organizationId") org: string,
    @Param("id") id: string,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") correlation?: string,
  ) {
    return this.service.get(await this.context(org, auth, correlation), this.resource, id);
  }
  @Post() async create(
    @Param("organizationId") org: string,
    @Body() input: Record<string, unknown>,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") correlation?: string,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.create(
      await this.context(org, auth, correlation),
      this.resource,
      input,
      key,
    );
  }
  @Post(":id/:action") async transition(
    @Param("organizationId") org: string,
    @Param("id") id: string,
    @Param("action") action: string,
    @Body() input: Record<string, unknown>,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") correlation?: string,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.transition(
      await this.context(org, auth, correlation),
      this.resource,
      id,
      action,
      input,
      key,
    );
  }
}

@Controller("api/v1/organizations/:organizationId/revenue-targets")
export class RevenueTargetController extends PlanningResourceController {
  readonly resource = "revenue-targets" as const;
}
@Controller("api/v1/organizations/:organizationId/forecast-versions")
export class ForecastVersionController extends PlanningResourceController {
  readonly resource = "forecast-versions" as const;
}
