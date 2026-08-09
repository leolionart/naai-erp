import { Body, Controller, Get, Headers, Inject, Param, Post, Query, Res } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { FastifyReply } from "fastify";
import { ReportExportService } from "./report-export.service.js";

@Controller("api/v1/organizations/:organizationId")
export class ReportExportController {
  constructor(@Inject(ReportExportService) private readonly s: ReportExportService) {}
  private c(o: string, a?: string, c?: string) {
    return this.s.authenticate(a, o, c ?? randomUUID());
  }
  @Get("report-snapshots") async ls(
    @Param("organizationId") o: string,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
  ) {
    return this.s.listSnapshots(await this.c(o, a, c));
  }
  @Get("report-snapshots/:id") async gs(
    @Param("organizationId") o: string,
    @Param("id") id: string,
    @Query("version") v?: string,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
  ) {
    return this.s.getSnapshot(await this.c(o, a, c), id, v ? Number(v) : undefined);
  }
  @Post("report-snapshots") async cs(
    @Param("organizationId") o: string,
    @Body() b: Record<string, unknown>,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
    @Headers("idempotency-key") k?: string,
  ) {
    return this.s.createSnapshot(await this.c(o, a, c), this.s.parseSnapshot(b), k);
  }
  @Post("report-snapshots/:id/versions/:version/reproduce") async rs(
    @Param("organizationId") o: string,
    @Param("id") id: string,
    @Param("version") v: string,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
  ) {
    return this.s.reproduceSnapshot(await this.c(o, a, c), id, Number(v));
  }
  @Get("accountant-exports") async le(
    @Param("organizationId") o: string,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
  ) {
    return this.s.listExports(await this.c(o, a, c));
  }
  @Get("accounting-list-exports/sales-invoices") async salesListExport(
    @Param("organizationId") o: string,
    @Query() q: Record<string, unknown>,
    @Res() reply: FastifyReply,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
  ) {
    const file = await this.s.exportSalesInvoices(await this.c(o, a, c), this.s.parseListExport(q));
    return reply
      .header("content-type", file.mediaType)
      .header("content-disposition", `attachment; filename="${file.filename}"`)
      .header("x-content-sha256", file.sha256)
      .send(file.content);
  }
  @Get("accounting-list-exports/purchase-invoices-expenses") async purchaseListExport(
    @Param("organizationId") o: string,
    @Query() q: Record<string, unknown>,
    @Res() reply: FastifyReply,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
  ) {
    const file = await this.s.exportPurchaseInvoicesExpenses(
      await this.c(o, a, c),
      this.s.parseListExport(q),
    );
    return reply
      .header("content-type", file.mediaType)
      .header("content-disposition", `attachment; filename="${file.filename}"`)
      .header("x-content-sha256", file.sha256)
      .send(file.content);
  }
  @Get("accounting-list-exports/management-workbook") async managementWorkbookExport(
    @Param("organizationId") o: string,
    @Query() q: Record<string, unknown>,
    @Res() reply: FastifyReply,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
  ) {
    const file = await this.s.exportManagementWorkbook(
      await this.c(o, a, c),
      this.s.parseManagementExport(q),
    );
    return reply
      .header("content-type", file.mediaType)
      .header("content-disposition", `attachment; filename="${file.filename}"`)
      .header("x-content-sha256", file.sha256)
      .send(file.content);
  }
  @Get("accountant-exports/:id") async ge(
    @Param("organizationId") o: string,
    @Param("id") id: string,
    @Query("version") v?: string,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
  ) {
    return this.s.getExport(await this.c(o, a, c), id, v ? Number(v) : undefined);
  }
  @Post("accountant-exports") async ce(
    @Param("organizationId") o: string,
    @Body() b: Record<string, unknown>,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
    @Headers("idempotency-key") k?: string,
  ) {
    return this.s.createExport(await this.c(o, a, c), this.s.parseExport(b), k);
  }
  @Get("accountant-exports/:id/versions/:version/download") async de(
    @Param("organizationId") o: string,
    @Param("id") id: string,
    @Param("version") v: string,
    @Res() reply: FastifyReply,
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
  ) {
    const file = await this.s.download(await this.c(o, a, c), id, Number(v));
    return reply
      .header("content-type", file.mediaType)
      .header("content-disposition", `attachment; filename="${file.filename.replaceAll('"', "")}"`)
      .send(file.content);
  }
  @Post("accountant-exports/:id/versions/:version/supersede") async se(
    @Param("organizationId") o: string,
    @Param("id") id: string,
    @Param("version") v: string,
    @Body() b: { reason?: string },
    @Headers("authorization") a?: string,
    @Headers("x-correlation-id") c?: string,
    @Headers("idempotency-key") k?: string,
  ) {
    return this.s.supersede(await this.c(o, a, c), id, Number(v), b.reason ?? "", k);
  }
}
