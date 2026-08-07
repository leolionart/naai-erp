import { Body, Controller, Get, Headers, Inject, Param, Post, Res } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { FastifyReply } from "fastify";
import { PortableDataPackageService } from "./portable-data-package.service.js";

@Controller("api/v1/organizations/:organizationId/portable-data-packages")
export class PortableDataPackageController {
  constructor(
    @Inject(PortableDataPackageService) private readonly service: PortableDataPackageService,
  ) {}

  private context(organizationId: string, authorization?: string, correlationId?: string) {
    return this.service.authenticate(authorization, organizationId, correlationId ?? randomUUID());
  }

  @Post("exports")
  async create(
    @Param("organizationId") organizationId: string,
    @Body() body: Record<string, unknown>,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const context = await this.context(organizationId, authorization, correlationId);
    return this.service.createExport(context, this.service.parseExportInput(body), idempotencyKey);
  }

  @Get("exports/:packageId")
  async get(
    @Param("organizationId") organizationId: string,
    @Param("packageId") packageId: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.service.getExport(
      await this.context(organizationId, authorization, correlationId),
      packageId,
    );
  }

  @Get("exports/:packageId/inventory")
  async inventory(
    @Param("organizationId") organizationId: string,
    @Param("packageId") packageId: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.service.getInventory(
      await this.context(organizationId, authorization, correlationId),
      packageId,
    );
  }

  @Get("exports/:packageId/download")
  async download(
    @Param("organizationId") organizationId: string,
    @Param("packageId") packageId: string,
    @Res() reply: FastifyReply,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    const file = await this.service.download(
      await this.context(organizationId, authorization, correlationId),
      packageId,
    );
    return reply
      .header("content-type", file.mediaType)
      .header("content-disposition", `attachment; filename="${file.filename.replaceAll('"', "")}"`)
      .header("x-content-sha256", file.contentHash)
      .send(file.content);
  }
}
