import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { CustomerServiceSubscriptionService } from "./customer-service-subscription.service.js";
@Controller("api/v1/organizations/:organizationId")
export class CustomerServiceSubscriptionController {
  constructor(
    @Inject(CustomerServiceSubscriptionService)
    private readonly service: CustomerServiceSubscriptionService,
  ) {}
  private context(o: string, a?: string, c?: string) {
    return this.service.authenticate(a, o, c ?? randomUUID());
  }
  private version(input: Record<string, unknown>, ifMatch?: string) {
    return { ...input, expectedResourceVersion: (ifMatch ?? "").replace(/^W\/|"/g, "") };
  }
  @Get("service-plans") async listPlans(
    @Param("organizationId") o: string,
    @Query() q: Record<string, string | undefined>,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
  ) {
    return this.service.listPlans(await this.context(o, a, c), q);
  }
  @Get("service-plans/:id") async getPlan(
    @Param("organizationId") o: string,
    @Param("id") id: string,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
  ) {
    return this.service.getPlan(await this.context(o, a, c), id);
  }
  @Post("service-plans") async createPlan(
    @Param("organizationId") o: string,
    @Body() i: Record<string, unknown>,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
    @Headers("idempotency-key") k?: string,
  ) {
    return this.service.createPlan(await this.context(o, a, c), i, k);
  }
  @Patch("service-plans/:id") async updatePlan(
    @Param("organizationId") o: string,
    @Param("id") id: string,
    @Body() i: Record<string, unknown>,
    @Headers("if-match") v?: string,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
    @Headers("idempotency-key") k?: string,
  ) {
    return this.service.updatePlan(await this.context(o, a, c), id, this.version(i, v), k);
  }
  @Post("service-plans/:id/deactivate") async deactivatePlan(
    @Param("organizationId") o: string,
    @Param("id") id: string,
    @Body() i: Record<string, unknown>,
    @Headers("if-match") v?: string,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
    @Headers("idempotency-key") k?: string,
  ) {
    return this.service.deactivatePlan(await this.context(o, a, c), id, this.version(i, v), k);
  }
  @Delete("service-plans/:id") async deletePlan(
    @Param("organizationId") o: string,
    @Param("id") id: string,
    @Body() i: Record<string, unknown>,
    @Headers("if-match") v?: string,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
    @Headers("idempotency-key") k?: string,
  ) {
    return this.service.deletePlan(await this.context(o, a, c), id, this.version(i, v), k);
  }
  @Get("customer-service-subscriptions") async list(
    @Param("organizationId") o: string,
    @Query() q: Record<string, string | undefined>,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
  ) {
    return this.service.listSubscriptions(await this.context(o, a, c), q);
  }
  @Get("customer-service-subscriptions/:id") async get(
    @Param("organizationId") o: string,
    @Param("id") id: string,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
  ) {
    return this.service.getSubscription(await this.context(o, a, c), id);
  }
  @Post("customer-service-subscriptions") async create(
    @Param("organizationId") o: string,
    @Body() i: Record<string, unknown>,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
    @Headers("idempotency-key") k?: string,
  ) {
    return this.service.createSubscription(await this.context(o, a, c), i, k);
  }
  @Patch("customer-service-subscriptions/:id") async update(
    @Param("organizationId") o: string,
    @Param("id") id: string,
    @Body() i: Record<string, unknown>,
    @Headers("if-match") v?: string,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
    @Headers("idempotency-key") k?: string,
  ) {
    return this.service.updateSubscription(await this.context(o, a, c), id, this.version(i, v), k);
  }
  @Post("customer-service-subscriptions/:id/:action(activate|pause|resume|cancel|expire)")
  async action(
    @Param("organizationId") o: string,
    @Param("id") id: string,
    @Param("action") action: string,
    @Body() i: Record<string, unknown>,
    @Headers("if-match") v?: string,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
    @Headers("idempotency-key") k?: string,
  ) {
    return this.service.transition(await this.context(o, a, c), id, action, this.version(i, v), k);
  }
  @Get("customer-service-subscriptions/:id/schedule-preview") async preview(
    @Param("organizationId") o: string,
    @Param("id") id: string,
    @Query("through") through: string,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
  ) {
    return this.service.preview(await this.context(o, a, c), id, through);
  }
}
