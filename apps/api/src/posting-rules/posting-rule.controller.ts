import { Body, Controller, Headers, Inject, Param, Post } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PostingRuleService } from "./posting-rule.service.js";

@Controller("api/v1/organizations/:organizationId/posting-rules")
export class PostingRuleController {
  constructor(@Inject(PostingRuleService) private readonly service: PostingRuleService) {}

  @Post("evaluate")
  async evaluate(
    @Param("organizationId") organizationId: string,
    @Body() input: Parameters<PostingRuleService["evaluate"]>[1],
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    const context = await this.service.authenticate(
      authorization,
      organizationId,
      correlationId ?? randomUUID(),
    );
    return this.service.evaluate(context, input);
  }
}
