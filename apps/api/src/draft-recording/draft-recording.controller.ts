import { Body, Controller, Headers, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DraftRecordingService } from "./draft-recording.service.js";
import type { BatchDraftRecordRequest } from "./draft-recording.types.js";

@Controller("api/v1/organizations/:organizationId/drafts")
export class DraftRecordingController {
  constructor(@Inject(DraftRecordingService) private readonly service: DraftRecordingService) {}

  @Post("record")
  @HttpCode(200)
  async recordBatch(
    @Param("organizationId") organizationId: string,
    @Body() body: BatchDraftRecordRequest,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const context = await this.service.authenticate(
      authorization,
      organizationId,
      correlationId ?? randomUUID(),
    );
    return this.service.recordBatch(context, body ?? {}, idempotencyKey);
  }
}
