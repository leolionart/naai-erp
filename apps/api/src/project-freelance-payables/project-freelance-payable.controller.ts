import { Body, Controller, Get, Headers, Inject, Param, Post, Query } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { RecordFreelancePayablePaymentRequest } from "@naai-erp/contracts";
import { ProjectFreelancePayableService } from "./project-freelance-payable.service.js";
@Controller("api/v1/organizations/:organizationId/project-freelance-payables")
export class ProjectFreelancePayableController {
  constructor(
    @Inject(ProjectFreelancePayableService)
    private readonly service: ProjectFreelancePayableService,
  ) {}
  private c(o: string, a?: string, c?: string) {
    return this.service.authenticate(a, o, c ?? randomUUID());
  }
  @Get() async list(
    @Param("organizationId") o: string,
    @Query("projectId") p?: string,
    @Query("freelancerPartyId") f?: string,
    @Query("state") s?: string,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
  ) {
    return this.service.list(await this.c(o, a, c), {
      ...(p ? { projectId: p } : {}),
      ...(f ? { freelancerPartyId: f } : {}),
      ...(s ? { state: s } : {}),
    });
  }
  @Get(":id") async get(
    @Param("organizationId") o: string,
    @Param("id") id: string,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
  ) {
    return this.service.get(await this.c(o, a, c), id);
  }
  @Post(":id/pay") async pay(
    @Param("organizationId") o: string,
    @Param("id") id: string,
    @Body() i: RecordFreelancePayablePaymentRequest,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
    @Headers("idempotency-key") k?: string,
  ) {
    return this.service.pay(await this.c(o, a, c), id, i, k);
  }
}
