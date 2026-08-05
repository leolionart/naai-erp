import { Body, Controller, Get, Headers, Inject, Param, Post, Query } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { OverheadAllocationService } from "./overhead-allocation.service.js";
import type { OverheadResource } from "./overhead-allocation.types.js";

abstract class ResourceController {
  abstract readonly resource: OverheadResource;
  constructor(
    @Inject(OverheadAllocationService) protected readonly service: OverheadAllocationService,
  ) {}
  private context(org: string, auth?: string, correlation?: string) {
    return this.service.authenticate(auth, org, correlation ?? randomUUID());
  }
  @Get() async list(
    @Param("organizationId") org: string,
    @Query("periodStart") periodStart?: string,
    @Query("periodEnd") periodEnd?: string,
    @Query("state") state?: string,
    @Headers("authorization") auth?: string,
    @Headers("x-correlation-id") correlation?: string,
  ) {
    return this.service.list(await this.context(org, auth, correlation), this.resource, {
      periodStart,
      periodEnd,
      state,
    });
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
@Controller("api/v1/organizations/:organizationId/overhead-allocation-policies")
export class OverheadPolicyController extends ResourceController {
  readonly resource = "overhead-allocation-policies" as const;
}
@Controller("api/v1/organizations/:organizationId/overhead-source-pools")
export class OverheadSourcePoolController extends ResourceController {
  readonly resource = "overhead-source-pools" as const;
}
@Controller("api/v1/organizations/:organizationId/overhead-allocation-runs")
export class OverheadRunController extends ResourceController {
  readonly resource = "overhead-allocation-runs" as const;
}
