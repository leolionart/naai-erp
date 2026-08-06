import { Body, Controller, Get, Headers, Inject, Param, Patch, Post } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { WorkbookImportService } from "./workbook-import.service.js";
import type {
  UpdateWorkbookImportReviewRowInput,
  WorkbookImportPayload,
} from "./workbook-import.types.js";

@Controller("api/v1/organizations/:organizationId/workbook-imports")
export class WorkbookImportController {
  constructor(@Inject(WorkbookImportService) private readonly service: WorkbookImportService) {}

  private async context(organizationId: string, authorization?: string, correlationId?: string) {
    const corr = correlationId ?? randomUUID();
    if (!authorization) throw new Error("UNAUTHORIZED");
    const auth = await this.service.authenticate(
      authorization.replace(/^Bearer\s+/i, ""),
      organizationId,
      corr,
    );
    return {
      organizationId,
      actorId: auth.actorId,
      roles: auth.roles,
      correlationId: corr,
    };
  }

  @Post("dry-run")
  async dryRun(
    @Param("organizationId") organizationId: string,
    @Body() payload: WorkbookImportPayload,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    await this.context(organizationId, authorization, correlationId);
    const result = await this.service.dryRun(organizationId, payload);
    return {
      apiVersion: "v1" as const,
      requestId: correlationId ?? randomUUID(),
      organizationId,
      data: result,
    };
  }

  @Post("commit")
  async commit(
    @Param("organizationId") organizationId: string,
    @Body() payload: WorkbookImportPayload,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    const ctx = await this.context(organizationId, authorization, correlationId);
    const result = await this.service.commit(
      organizationId,
      payload,
      ctx.actorId,
      ctx.correlationId,
    );
    return {
      apiVersion: "v1" as const,
      requestId: ctx.correlationId,
      organizationId,
      data: result,
    };
  }

  @Get("review-rows")
  async listReviewRows(
    @Param("organizationId") organizationId: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    const ctx = await this.context(organizationId, authorization, correlationId);
    const result = await this.service.listReviewRows(organizationId, ctx.roles);
    return {
      apiVersion: "v1" as const,
      requestId: ctx.correlationId,
      organizationId,
      data: { items: result },
    };
  }

  @Get("review-rows/:id")
  async getReviewRow(
    @Param("organizationId") organizationId: string,
    @Param("id") id: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    const ctx = await this.context(organizationId, authorization, correlationId);
    const result = await this.service.getReviewRow(organizationId, id, ctx.roles);
    return {
      apiVersion: "v1" as const,
      requestId: ctx.correlationId,
      organizationId,
      data: result,
    };
  }

  @Patch("review-rows/:id")
  async updateReviewRow(
    @Param("organizationId") organizationId: string,
    @Param("id") id: string,
    @Body() input: UpdateWorkbookImportReviewRowInput,
    @Headers("if-match") expectedVersion?: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    const ctx = await this.context(organizationId, authorization, correlationId);
    const result = await this.service.updateReviewRow(
      organizationId,
      id,
      expectedVersion ?? "",
      input,
      ctx.actorId,
      ctx.roles,
      ctx.correlationId,
    );
    return {
      apiVersion: "v1" as const,
      requestId: ctx.correlationId,
      organizationId,
      data: result,
    };
  }
}
