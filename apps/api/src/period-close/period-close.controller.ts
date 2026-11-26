import { randomUUID } from "node:crypto";
import { Body, Controller, Get, Headers, Inject, Param, Post, Query } from "@nestjs/common";
import type {
  ExecuteOwnerSettlementRequestContract,
  RecordCashCountRequestContract,
  RecordCloseChecklistNoteRequestContract,
} from "@naai-erp/contracts";
import { CashCountService } from "./cash-count.service.js";
import { OwnerSettlementService } from "./owner-settlement.service.js";
import { PeriodCloseChecklistService } from "./period-close-checklist.service.js";

@Controller("api/v1/organizations/:organizationId")
export class PeriodCloseController {
  constructor(
    @Inject(PeriodCloseChecklistService)
    private readonly checklistService: PeriodCloseChecklistService,
    @Inject(CashCountService) private readonly cashCountService: CashCountService,
    @Inject(OwnerSettlementService)
    private readonly ownerSettlementService: OwnerSettlementService,
  ) {}

  @Get("fiscal-periods")
  async listPeriods(
    @Param("organizationId") organizationId: string,
    @Query("fiscalYear") fiscalYear?: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    const context = await this.checklistService.authenticate(
      authorization,
      organizationId,
      correlationId ?? randomUUID(),
    );
    const parsedYear = fiscalYear?.trim() ? Number(fiscalYear.trim()) : undefined;
    if (parsedYear !== undefined && !Number.isInteger(parsedYear)) {
      throw new Error("VALIDATION_FAILED");
    }
    return this.checklistService.listFiscalPeriods(context, parsedYear);
  }

  @Get("fiscal-periods/:fiscalYear/:periodNumber/close-checklist")
  async getChecklist(
    @Param("organizationId") organizationId: string,
    @Param("fiscalYear") fiscalYear: string,
    @Param("periodNumber") periodNumber: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    const context = await this.checklistService.authenticate(
      authorization,
      organizationId,
      correlationId ?? randomUUID(),
    );
    return this.checklistService.getCloseChecklist(
      context,
      Number(fiscalYear),
      Number(periodNumber),
    );
  }

  @Post("fiscal-periods/:fiscalYear/:periodNumber/close-checklist/notes")
  async recordChecklistNote(
    @Param("organizationId") organizationId: string,
    @Param("fiscalYear") fiscalYear: string,
    @Param("periodNumber") periodNumber: string,
    @Body() body: RecordCloseChecklistNoteRequestContract,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const context = await this.checklistService.authenticate(
      authorization,
      organizationId,
      correlationId ?? randomUUID(),
    );
    return this.checklistService.recordChecklistNote(
      context,
      Number(fiscalYear),
      Number(periodNumber),
      body,
      idempotencyKey,
    );
  }

  @Get("banking/cash-counts")
  async listCashCounts(
    @Param("organizationId") organizationId: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("asOf") asOf?: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    const context = await this.cashCountService.authenticate(
      authorization,
      organizationId,
      correlationId ?? randomUUID(),
    );
    return this.cashCountService.list(context, {
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(asOf ? { asOf } : {}),
    });
  }

  @Get("banking/cash-counts/:id")
  async getCashCount(
    @Param("organizationId") organizationId: string,
    @Param("id") id: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    const context = await this.cashCountService.authenticate(
      authorization,
      organizationId,
      correlationId ?? randomUUID(),
    );
    return this.cashCountService.get(context, id);
  }

  @Post("banking/cash-counts")
  async recordCashCount(
    @Param("organizationId") organizationId: string,
    @Body() body: RecordCashCountRequestContract,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const context = await this.cashCountService.authenticate(
      authorization,
      organizationId,
      correlationId ?? randomUUID(),
    );
    return this.cashCountService.record(context, body, idempotencyKey);
  }

  @Get("banking/owner-settlements/position")
  async getOwnerSettlementPosition(
    @Param("organizationId") organizationId: string,
    @Query("fiscalYear") fiscalYear?: string,
    @Query("asOf") asOf?: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    const context = await this.ownerSettlementService.authenticate(
      authorization,
      organizationId,
      correlationId ?? randomUUID(),
    );
    const parsedYear = fiscalYear?.trim() ? Number(fiscalYear.trim()) : undefined;
    if (parsedYear !== undefined && !Number.isInteger(parsedYear)) {
      throw new Error("VALIDATION_FAILED");
    }
    return this.ownerSettlementService.getPosition(context, {
      ...(parsedYear !== undefined ? { fiscalYear: parsedYear } : {}),
      ...(asOf ? { asOf } : {}),
    });
  }

  @Post("banking/owner-settlements")
  async executeOwnerSettlement(
    @Param("organizationId") organizationId: string,
    @Body() body: ExecuteOwnerSettlementRequestContract,
    @Headers("authorization") authorization?: string,
    @Headers("x-correlation-id") correlationId?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const context = await this.ownerSettlementService.authenticate(
      authorization,
      organizationId,
      correlationId ?? randomUUID(),
    );
    return this.ownerSettlementService.executeSettlement(context, body, idempotencyKey);
  }
}
