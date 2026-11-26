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
  Put,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { FundingInputContract } from "@naai-erp/contracts";
import { FundingRulesService } from "./funding-rules.service.js";
import type {
  CreateFundingRuleInput,
  FundingRuleTestInput,
  UpdateFundingRuleInput,
} from "./funding-rules.types.js";

@Controller("api/v1/organizations/:organizationId/funding-rules")
export class FundingRulesController {
  constructor(@Inject(FundingRulesService) private readonly service: FundingRulesService) {}

  private context(organizationId: string, authorization?: string, correlationId?: string) {
    return this.service.authenticate(authorization, organizationId, correlationId ?? randomUUID());
  }

  @Get()
  async list(
    @Param("organizationId") organizationId: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.service.list(await this.context(organizationId, authorization, correlationId));
  }

  @Put("default")
  async setDefault(
    @Param("organizationId") organizationId: string,
    @Body() body: { defaultFunding?: FundingInputContract } & Partial<FundingInputContract>,
    @Headers("authorization") authorization?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    const funding = body.defaultFunding ?? (body as FundingInputContract);
    return this.service.setDefault(
      await this.context(organizationId, authorization, correlationId),
      funding,
      idempotencyKey,
    );
  }

  @Post()
  async createRule(
    @Param("organizationId") organizationId: string,
    @Body() input: CreateFundingRuleInput,
    @Headers("authorization") authorization?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.service.createRule(
      await this.context(organizationId, authorization, correlationId),
      input,
      idempotencyKey,
    );
  }

  @Patch(":ruleId")
  async updateRule(
    @Param("organizationId") organizationId: string,
    @Param("ruleId") ruleId: string,
    @Body() input: UpdateFundingRuleInput,
    @Headers("authorization") authorization?: string,
    @Headers("if-match") ifMatch?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.service.updateRule(
      await this.context(organizationId, authorization, correlationId),
      ruleId,
      ifMatch,
      input,
      idempotencyKey,
    );
  }

  @Delete(":ruleId")
  async deleteRule(
    @Param("organizationId") organizationId: string,
    @Param("ruleId") ruleId: string,
    @Headers("authorization") authorization?: string,
    @Headers("if-match") ifMatch?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.service.deleteRule(
      await this.context(organizationId, authorization, correlationId),
      ruleId,
      ifMatch,
      idempotencyKey,
    );
  }

  @Post("test")
  async test(
    @Param("organizationId") organizationId: string,
    @Body() candidate: FundingRuleTestInput,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.service.test(
      await this.context(organizationId, authorization, correlationId),
      candidate ?? {},
    );
  }
}
