import { Body, Controller, Get, Headers, Inject, Param, Post } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { ProjectCostService } from "./project-cost.service.js";
@Controller("api/v1/organizations/:organizationId")
export class ProjectCostController {
  constructor(@Inject(ProjectCostService) private readonly s: ProjectCostService) {}
  private c(o: string, a?: string, c?: string) {
    return this.s.authenticate(a, o, c ?? randomUUID());
  }
  @Get("project-costs") async list(
    @Param("organizationId") o: string,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
  ) {
    return this.s.list(await this.c(o, a, c));
  }
  @Get("project-costs/:id") async get(
    @Param("organizationId") o: string,
    @Param("id") id: string,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
  ) {
    return this.s.get(await this.c(o, a, c), id);
  }
  @Get("project-cost-sources/unallocated") async sources(
    @Param("organizationId") o: string,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
  ) {
    return this.s.unallocated(await this.c(o, a, c));
  }
  @Get("direct-cost-allocations") async allocations(
    @Param("organizationId") o: string,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
  ) {
    return this.s.allocations(await this.c(o, a, c));
  }
  @Get("direct-cost-allocations/:id") async allocation(
    @Param("organizationId") o: string,
    @Param("id") id: string,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
  ) {
    return this.s.allocation(await this.c(o, a, c), id);
  }
  @Post("direct-cost-allocations") async create(
    @Param("organizationId") o: string,
    @Body() i: Record<string, unknown>,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
    @Headers("idempotency-key") k?: string,
  ) {
    return this.s.create(await this.c(o, a, c), i, k);
  }
  @Post("direct-cost-allocations/:id/:action") async action(
    @Param("organizationId") o: string,
    @Param("id") id: string,
    @Param("action") action: string,
    @Body() i: Record<string, unknown>,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
    @Headers("idempotency-key") k?: string,
  ) {
    return this.s.transition(await this.c(o, a, c), id, action, i, k);
  }
}
