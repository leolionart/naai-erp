import { Body, Controller, Get, Headers, Inject, Param, Post } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { CreateCustomerReceiptRequest } from "@naai-erp/contracts";
import { CustomerReceiptService } from "./customer-receipt.service.js";
@Controller("api/v1/organizations/:organizationId/customer-receipts")
export class CustomerReceiptController {
  constructor(@Inject(CustomerReceiptService) private readonly service: CustomerReceiptService) {}
  private c(o: string, a?: string, c?: string) {
    return this.service.authenticate(a, o, c ?? randomUUID());
  }
  @Post() async create(
    @Param("organizationId") o: string,
    @Body() i: CreateCustomerReceiptRequest,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
    @Headers("idempotency-key") k?: string,
  ) {
    return this.service.create(await this.c(o, a, c), i, k);
  }
  @Get() async list(
    @Param("organizationId") o: string,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
  ) {
    return this.service.list(await this.c(o, a, c));
  }
  @Get(":id") async get(
    @Param("organizationId") o: string,
    @Param("id") id: string,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
  ) {
    return this.service.get(await this.c(o, a, c), id);
  }
}
