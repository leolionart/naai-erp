import { Controller, Get, Headers, Inject, Param } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { InternalTransferService } from "./internal-transfer.service.js";
@Controller("api/v1/organizations/:organizationId/banking/transactions")
export class InternalTransferCandidateController {
  constructor(@Inject(InternalTransferService) private readonly service: InternalTransferService) {}
  @Get(":id/transfer-candidates") async candidates(
    @Param("organizationId") o: string,
    @Param("id") id: string,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
  ) {
    const context = await this.service.authenticate(a, o, c ?? randomUUID());
    return this.service.candidates(context, id);
  }
}
