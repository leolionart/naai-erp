import { Body, Controller, Get, Headers, Inject, Param, Post, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { PortableDataPackageService } from "./portable-data-package.service.js";
import { PortableDataImportService } from "./portable-data-import.service.js";
import type { PortableWorkbookUpload } from "./portable-data-import.types.js";

type MultipartPart = Readonly<{
  filename?: string;
  toBuffer?: () => Promise<Buffer>;
  value?: unknown;
}>;
type MultipartRequest = FastifyRequest & {
  file?: () => Promise<MultipartPart | undefined>;
  body?: Record<string, MultipartPart | unknown>;
};

@Controller("api/v1/organizations/:organizationId/portable-data-packages/imports")
export class PortableDataImportController {
  constructor(
    @Inject(PortableDataImportService) private readonly imports: PortableDataImportService,
    @Inject(PortableDataPackageService) private readonly packages: PortableDataPackageService,
  ) {}

  private context(organizationId: string, authorization?: string, correlationId?: string) {
    return this.packages.authenticate(authorization, organizationId, correlationId ?? randomUUID());
  }

  private async workbook(request: MultipartRequest): Promise<PortableWorkbookUpload> {
    const part = request.file
      ? await request.file()
      : (request.body?.workbook as MultipartPart | undefined);
    if (!part?.toBuffer) throw new Error("PORTABLE_IMPORT_WORKBOOK_REQUIRED");
    return {
      filename: part.filename?.trim() || "portable-data-package.xlsx",
      content: await part.toBuffer(),
    };
  }

  @Post("inventory")
  async inventory(
    @Param("organizationId") organizationId: string,
    @Req() request: MultipartRequest,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return this.imports.inventory(
      await this.context(organizationId, authorization, correlationId),
      await this.workbook(request),
      idempotencyKey,
    );
  }

  @Post("dry-run")
  async dryRun(
    @Param("organizationId") organizationId: string,
    @Req() request: MultipartRequest,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return this.imports.dryRun(
      await this.context(organizationId, authorization, correlationId),
      await this.workbook(request),
      idempotencyKey,
    );
  }

  @Get(":importId")
  async status(
    @Param("organizationId") organizationId: string,
    @Param("importId") importId: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return this.imports.status(
      await this.context(organizationId, authorization, correlationId),
      importId,
    );
  }

  @Post(":importId/commit")
  async commit(
    @Param("organizationId") organizationId: string,
    @Param("importId") importId: string,
    @Body() body: Record<string, unknown>,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return this.imports.commit(
      await this.context(organizationId, authorization, correlationId),
      importId,
      body,
      idempotencyKey,
    );
  }
}
