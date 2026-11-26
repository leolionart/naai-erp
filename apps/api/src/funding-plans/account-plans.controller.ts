import { Body, Controller, Headers, Inject, Param, Post } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AccountPlansService, type AccountPlanItemInput } from "./account-plans.service.js";

@Controller("api/v1/organizations/:organizationId/account-plans")
export class AccountPlansController {
  constructor(@Inject(AccountPlansService) private readonly service: AccountPlansService) {}

  private context(organizationId: string, authorization?: string, correlationId?: string) {
    return this.service.authenticate(authorization, organizationId, correlationId ?? randomUUID());
  }

  @Post("dry-run")
  async dryRun(
    @Param("organizationId") organizationId: string,
    @Body() body: { items: readonly AccountPlanItemInput[] },
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.service.dryRun(
      await this.context(organizationId, authorization, correlationId),
      body ?? { items: [] },
    );
  }

  @Post("commit")
  async commit(
    @Param("organizationId") organizationId: string,
    @Body()
    body: {
      planHash: string;
      items: readonly AccountPlanItemInput[];
      reason?: string;
      postReplacement?: boolean;
    },
    @Headers("authorization") authorization?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.service.commit(
      await this.context(organizationId, authorization, correlationId),
      body ?? { planHash: "", items: [] },
      idempotencyKey,
    );
  }
}
